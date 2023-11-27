import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'

import {getCommandArgs} from '../utils/command'
import {checkCommenterAuth} from '../utils/auth'
import {newOctokit} from "../utils/octokit";

/**
 * /unassign will remove the assignment for argument users (or self)
 *
 * @param context - the github actions event context
 */
export const unassign = async (
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

    const commentArgs: string[] = getCommandArgs('/unassign', commentBody)

    // no arguments after command provided
    if (commentArgs.length === 0) {
        try {
            /* eslint-disable @typescript-eslint/naming-convention */
            await octokit.issues.removeAssignees({
                ...context.repo,
                issue_number: issueNumber,
                assignees: [commenterId]
            })
            /* eslint-enable @typescript-eslint/naming-convention */
        } catch (e) {
            throw new Error(`could not remove assignee: ${e}`)
        }

        return
    }

    let isAuthUser: Boolean = false
    try {
        isAuthUser = await checkCommenterAuth(
            context,
            issueNumber,
            commenterId
        )
    } catch (e) {
        throw new Error(`couldn ot check commentor Auth: ${e}`)
    }

    if (isAuthUser) {
        try {
            /* eslint-disable @typescript-eslint/naming-convention */
            await octokit.issues.removeAssignees({
                ...context.repo,
                issue_number: issueNumber,
                assignees: commentArgs
            })
            /* eslint-enable @typescript-eslint/naming-convention */
        } catch (e) {
            throw new Error(`could not remove assignee: ${e}`)
        }
    }
}
