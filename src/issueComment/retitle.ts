import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'

import {getCommandArgs} from '../utils/command'
import {checkAuthorizedByOwners, checkCollaborator} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /retitle will "rename" the issue / PR.
 * Note - it is expected that the command has an argument with the new title
 *
 * @param context - the github actions event context
 */
export const retitle = async (
    context: Context = github.context
): Promise<void> => {
    const octokit = newOctokit()

    const issueNumber: number | undefined = context.payload.issue?.number
    const commenterId: string = context.payload.comment?.user?.login
    const commentBody: string = context.payload.comment?.body

    if (issueNumber === undefined) {
        throw new Error(
            `github context payload missing issue number: ${context.payload}`
        )
    }

    const commentArgs: string[] = getCommandArgs('/retitle', commentBody)

    // no arguments after command provided. Can't retitle!
    if (commentArgs.length === 0) {
        return
    }

    // Only users who:
    // - are collaborators
    let isAuthUser: Boolean = false
    let isReviewer: Boolean = false
    let isApprover: Boolean = false
    try {
        isReviewer = await checkAuthorizedByOwners(context, commenterId, 'reviewers')
        isApprover = await checkAuthorizedByOwners(context, commenterId, 'approvers')
        if (!isReviewer && !isApprover) {
            isAuthUser = await checkCollaborator(context, commenterId)
        }
    } catch (e) {
        throw new Error(`could not check Commentor auth: ${e}`)
    }

    if (isReviewer || isApprover || isAuthUser) {
        try {
            /* eslint-disable @typescript-eslint/naming-convention */
            await octokit.issues.update({
                ...context.repo,
                issue_number: issueNumber,
                title: commentArgs.join(' ')
            })
            /* eslint-enable @typescript-eslint/naming-convention */
        } catch (e) {
            throw new Error(`could not update issue: ${e}`)
        }
    } else {
        console.log(`Authentication failed: Reviewer: ${isReviewer}, Approver: ${isApprover}, Collaborator: ${isAuthUser}`)
    }
}
