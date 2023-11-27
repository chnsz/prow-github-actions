import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'
import {getCommandArgs} from '../utils/command'
import {checkCollaborator, checkCommenterAuth} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /uncc will remove the review request for argument users (or self)
 *
 * @param context - the github actions event context
 */
export const uncc = async (
    context: Context = github.context
): Promise<void> => {
    const octokit = newOctokit()

    const pullNumber: number | undefined = context.payload.issue?.number
    const commenterId: string = context.payload.comment?.user?.login
    const commentBody: string = context.payload.comment?.body

    if (pullNumber === undefined) {
        throw new Error(
            `github context payload missing pull number: ${context.payload}`
        )
    }

    const commentArgs: string[] = getCommandArgs('/uncc', commentBody)

    // no arguments after command provided
    if (commentArgs.length === 0) {
        try {
            await removeSelfReviewReq(context, pullNumber, commenterId)
        } catch (e) {
            throw new Error(`could not self uncc: ${e}`)
        }
        return
    }

    // Only target users who:
    // - are members of the org
    // - are collaborators
    // - have previously commented on this issue
    let authUser: Boolean = false
    try {
        authUser = await checkCommenterAuth(
            context,
            pullNumber,
            commenterId
        )
    } catch (e) {
        throw new Error(`could not get authorized users: ${e}`)
    }

    if (authUser) {
        /* eslint-disable @typescript-eslint/naming-convention */
        await octokit.pulls.removeRequestedReviewers({
            ...context.repo,
            pull_number: pullNumber,
            reviewers: commentArgs
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    }
}

/**
 * removeSelfReviewReq will remove the self review req if no arguments were provided
 *
 * @param context - the github actions event context
 * @param pullNum - the pr number this runtime is associated with
 * @param user - the user to self assign
 */
const removeSelfReviewReq = async (
    context: Context,
    pullNum: number,
    user: string
): Promise<void> => {
    const isCollaborator = await checkCollaborator(context, user)
    const octokit = newOctokit()

    if (isCollaborator) {
        /* eslint-disable @typescript-eslint/naming-convention */
        await octokit.pulls.removeRequestedReviewers({
            ...context.repo,
            pull_number: pullNum,
            reviewers: [user]
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    }
}
