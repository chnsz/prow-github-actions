import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'

import {checkAuthorizedByOwners, checkCollaborator} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /close will close the issue / PR
 *
 * @param context - the github actions event context
 */
export const close = async (
    context: Context = github.context
): Promise<void> => {
    const octokit = newOctokit()

    const issueNumber: number | undefined = context.payload.issue?.number
    const commenterId: string = context.payload.comment?.user?.login

    if (issueNumber === undefined) {
        throw new Error(
            `github context payload missing issue number: ${context.payload}`
        )
    }

    // Only users who:
    // - are collaborators
    let isAuthUser: Boolean = false
    let isReviewer: Boolean = false
    let isApprover: Boolean = false
    try {
        isReviewer = await checkAuthorizedByOwners(context, commenterId, 'reviewers')
        isApprover = await checkAuthorizedByOwners(context, commenterId, 'approvers')
        if (!(isReviewer || isApprover)) {
            isAuthUser = await checkCollaborator(context, commenterId)
        }
    } catch (e) {
        throw new Error(`could not check commenter auth: ${e}`)
    }

    if (isAuthUser || isReviewer || isApprover) {
        try {
            const state: "open" | "closed" = 'closed'
            await octokit.issues.update({
                ...context.repo,
                issue_number: issueNumber,
                state: state
            })
        } catch (e) {
            throw new Error(`could not close issue: ${e}`)
        }
    } else {
        console.log(`Close failed: Reviewer: ${isReviewer}, Approver: ${isApprover}, Collaborator: ${isAuthUser}`)
    }
}
