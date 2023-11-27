import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'

import {getCommandArgs, getLineArgs} from '../utils/command'
import {checkAuthorizedByOwners, checkCollaborator} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /milestone will add the issue to an existing milestone.
 * Note that the command should have an argument with the milestone to add
 *
 * @param context - the github actions event context
 */
export const milestone = async (
    context: Context = github.context
): Promise<void> => {
    const octokit = newOctokit()

    const issueNumber: number | undefined = context.payload.issue?.number
    const commentBody: string = context.payload.comment?.body
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

    if (!(isAuthUser || isReviewer || isApprover)) {
        throw new Error(
            `commenter is not authorized to set a milestone. Must be repo collaborator`
        )
    }

    const commentArgs: string[] = getCommandArgs('/milestone', commentBody)
    if (commentArgs.length !== 0 && commentArgs[0] === 'cancel') {
        console.log('Remove milestone from #' + issueNumber)
        await octokit.issues.update({
            ...context.repo,
            issue_number: issueNumber,
            milestone: '',
        })
        return
    }

    const milestoneToAdd: string = getLineArgs('/milestone', commentBody)
    if (milestoneToAdd === '') {
        throw new Error(`please provide a milestone to add`)
    }

    const ms = await octokit.issues.listMilestones({
        ...context.repo
    })

    for (const m of ms.data) {
        if (m.title === milestoneToAdd) {
            /* eslint-disable @typescript-eslint/naming-convention */
            await octokit.issues.update({
                ...context.repo,
                issue_number: issueNumber,
                milestone: m.number
            })
            /* eslint-enable @typescript-eslint/naming-convention */
        }
    }
}
