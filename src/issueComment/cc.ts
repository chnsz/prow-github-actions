import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'

import {getCommandArgs} from '../utils/command'
import {checkCollaborator, getOrgCollabCommentUsers} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /cc will request a review from self with no arguments or the users specified
 * or assign the users in the argument list
 *
 * @param context - the github actions event context
 */
export const cc = async (context: Context = github.context): Promise<void> => {
    const octokit = newOctokit()

    const pullNumber: number | undefined = context.payload.issue?.number
    const commenterId: string = context.payload.comment?.user?.login
    const commentBody: string = context.payload.comment?.body

    if (pullNumber === undefined) {
        throw new Error(
            `github context payload missing pull number: ${context.payload}`
        )
    }

    const commentArgs: string[] = getCommandArgs('/cc', commentBody)

    // no arguments after command provided
    if (commentArgs.length === 0) {
        try {
            await selfReview(context, pullNumber, commenterId)
        } catch (e) {
            throw new Error(`could not self cc: ${e}`)
        }
        return
    }

    // Only target users who:
    // - are members of the org
    // - are collaborators
    // - have previously commented on this issue
    let authUsers: string[] = []
    try {
        authUsers = await getOrgCollabCommentUsers(
            context,
            pullNumber,
            commentArgs
        )
    } catch (e) {
        throw new Error(`could not get authorized users: ${e}`)
    }

    switch (authUsers.length) {
        case 0:
            throw new Error(
                `no authorized users found. Only users who are members of the org, are collaborators, or have previously commented on this issue may be cc'd`
            )

        default:
            try {
                /* eslint-disable @typescript-eslint/naming-convention */
                await octokit.pulls.requestReviewers({
                    ...context.repo,
                    pull_number: pullNumber,
                    reviewers: authUsers
                })
                /* eslint-enable @typescript-eslint/naming-convention */
            } catch (e) {
                throw new Error(`could not request reviewers: ${e}`)
            }
            break
    }
}

/**
 * selfReview will self request a review for the current PR
 *
 * @param context - the github actions event context
 * @param pullNum - the  pr number this runtime is associated with
 * @param user - the user to request a self review
 */
const selfReview = async (
    context: Context,
    pullNum: number,
    user: string
): Promise<void> => {
    const isCollaborator = await checkCollaborator(context, user)

    if (isCollaborator) {
        /* eslint-disable @typescript-eslint/naming-convention */
        await newOctokit().pulls.requestReviewers({
            ...context.repo,
            pull_number: pullNum,
            reviewers: [user]
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    }
}
