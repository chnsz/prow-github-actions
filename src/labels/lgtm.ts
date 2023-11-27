import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'
import * as core from '@actions/core'
import {getCommandArgs} from '../utils/command'
import {labelIssue, cancelLabel} from '../utils/labeling'
import {assertAuthorizedByOwnersOrMembership} from '../utils/auth'
import {createComment} from '../utils/comments'
import {commandTip} from "../issueComment/approve";

/**
 * /lgtm will add the lgtm label.
 * Note - this label is used to indicate automatic merging
 * if the user has configured a cron job to perform automatic merging
 *
 * @param context - the github actions event context
 */
export const lgtm = async (context: Context = github.context): Promise<void> => {
    const issueNumber: number | undefined = context.payload.issue?.number
    const commentBody: string = context.payload.comment?.body
    const commenterId: string = context.payload.comment?.user?.login
    const prAuthor: string | undefined = context.payload.issue?.user?.login

    if (prAuthor == commenterId) {
        const msg = "You are the author and cannot comment `/lgtm [cancel]`.\n\n" + commandTip
        core.info(msg)
        await createComment(context, issueNumber || 0, msg);
        return
    }

    if (issueNumber === undefined) {
        throw new Error(
            `github context payload missing issue number: ${context.payload}`
        );
    }

    try {
        await assertAuthorizedByOwnersOrMembership(context, 'reviewers', commenterId)
    } catch (e) {
        const msg = `Cannot apply the lgtm label because ${e}`
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

    const commentArgs: string[] = getCommandArgs('/lgtm', commentBody)
    // check if canceling last review
    if (commentArgs.length !== 0 && commentArgs[0] === 'cancel') {
        try {
            console.log("remove LGTM label on PR #" + issueNumber)
            await cancelLabel(context, issueNumber, 'LGTM')
        } catch (e) {
            throw new Error(`could not remove latest review: ${e}`)
        }
        return
    }

    await labelIssue(context, issueNumber, ['LGTM'])
}
