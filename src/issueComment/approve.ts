import * as github from '@actions/github'
import * as core from '@actions/core'
import {Endpoints} from '@octokit/types'

import {Context} from '@actions/github/lib/context'
import {getCommandArgs} from '../utils/command'
import {assertAuthorizedByOwnersOrMembership, checkAuthorizedByOwners} from '../utils/auth'
import {createComment} from '../utils/comments'
import {labelIssue, removeLabels} from "../utils/labeling";
import {APPROVED_LABEL, getRobotName, ROBOT_NAME} from "../constant";
import {newOctokit} from "../utils/octokit";

type PullsListReviewsResponseType =
    Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews']['response']

export const commandTip = "<details>\n\nThe full list of commands accepted by this bot can be found [here](https://github.com/chnsz/prow-github-actions/blob/main/docs/commands.md#prow-github-actions-commands).\n\n</details>"

/**
 * the /approve command will create a "approve" review
 * from the github-actions bot
 *
 * If the argument 'cancel' is provided to the /approve command
 * the last review will be removed
 *
 * @param context - the github actions event context
 */
export const approve = async (context: Context = github.context): Promise<void> => {
    core.debug(`starting approve job`)
    const octokit = newOctokit()

    const issueNumber: number | undefined = context.payload.issue?.number
    const commentBody: string = context.payload.comment?.body
    const commenterLogin: string = context.payload.comment?.user.login
    const prAuthor: string | undefined = context.payload.issue?.user?.login

    if (prAuthor == commenterLogin) {
        const msg = "You are the author and cannot comment `/approve [cancel]`.\n\n" + commandTip
        core.info(msg)
        await createComment(context, issueNumber || 0, msg);
        return
    }

    if (issueNumber === undefined) {
        throw new Error(
            `github context payload missing issue number: ${context.payload}`
        )
    }

    try {
        const isApprover = await checkAuthorizedByOwners(context, commenterLogin, 'approvers')
        if (!isApprover) {
            await createComment(context, issueNumber, `${commenterLogin} is not included in the approvers role in the OWNERS file`)
            return;
        }
    } catch (e) {
        const msg = `Cannot approve the pull request: ${e}`
        core.error(msg)

        // Try to reply back that the user is unauthorized
        try {
            await createComment(context, issueNumber, msg)
        } catch (commentE) {
            // Log the comment error but continue to throw the original auth error
            core.error(`Could not comment with an auth error: ${commentE}`)
        }
        throw e
    }

    const commentArgs: string[] = getCommandArgs('/approve', commentBody)

    // check if canceling last review
    if (commentArgs.length !== 0 && commentArgs[0] === 'cancel') {
        try {
            core.debug("remove approve label")
            await removeLabels(context, issueNumber, [APPROVED_LABEL])
        } catch (e) {
            throw new Error(`could not remove latest review: ${e}`)
        }
        try {
            core.debug("cancel approve")
            await cancel(context, issueNumber, commenterLogin, commentBody)
        } catch (e) {
            throw new Error(`could not cancel approve: ${e}`)
        }
        return
    }

    try {
        const body = `This PR has been approved by: @${commenterLogin}\n\n`
            + `<details>\n\n> ${commentBody.replace('\n', '\n> ')}\n\n</details>`;

        core.debug(`creating a review`)
        const event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = 'APPROVE';
        await octokit.pulls.createReview({
            ...context.repo,
            pull_number: issueNumber,
            event: event,
            body: body,
            comments: []
        })
        await labelIssue(context, issueNumber, [APPROVED_LABEL])
    } catch (e) {
        throw new Error(`could not create review: ${e}`)
    }
}

/**
 * Removes the latest review from the github actions bot
 *
 * @param context - the github actions workflow event context
 * @param issueNumber - the PR to remove the review
 * @param commenterLogin - the login name of the user who made comment
 */
const cancel = async (
    context: Context,
    issueNumber: number,
    commenterLogin: string,
    commentBody: string
): Promise<void> => {
    core.debug(`canceling latest review`)
    const octokit = newOctokit()

    let reviews: PullsListReviewsResponseType
    try {
        /* eslint-disable @typescript-eslint/naming-convention */
        reviews = await octokit.pulls.listReviews({
            ...context.repo,
            pull_number: issueNumber
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    } catch (e) {
        throw new Error(`could not list reviews for PR ${issueNumber}: ${e}`)
    }

    let latestReview = undefined

    for (const e of reviews.data) {
        core.debug(`checking review: ${e.user?.login}`)
        if (e.user?.login === getRobotName() && e.state === 'APPROVED') {
            latestReview = e
        }
    }

    if (latestReview === undefined) {
        throw new Error('no latest review found to cancel')
    }

    try {
        const body = `This PR has been dismissed by: @${commenterLogin}\n\n`
            + `<details>\n\n> ${commentBody.replace('\n', '\n> ')}\n\n</details>`;

        /* eslint-disable @typescript-eslint/naming-convention */
        await octokit.pulls.dismissReview({
            ...context.repo,
            pull_number: issueNumber,
            review_id: latestReview.id,
            message: body
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    } catch (e) {
        throw new Error(`could not dismiss review: ${e}`)
    }
}
