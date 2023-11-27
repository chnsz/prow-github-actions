import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'

import {checkAuthorizedByOwners, checkCollaborator} from '../utils/auth'
import {getCommandArgs} from '../utils/command'
import {newOctokit} from "../utils/octokit";

/**
 * /lock will lock the issue / PR.
 * No more comments will be permitted
 *
 * @param context - the github actions event context
 */
export const lock = async (
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

    const commentArgs: string[] = getCommandArgs('/lock', commentBody)

    // Only users who:
    // - are collaborators
    let isAuthUser: Boolean = false
    let isApprover: Boolean = false
    try {
        isApprover = await checkAuthorizedByOwners(context, commenterId, 'approvers')
        if (!isApprover) {
            isAuthUser = await checkCollaborator(context, commenterId)
        }
    } catch (e) {
        throw new Error(`could not check commenter auth: ${e}`)
    }

    if (isAuthUser || isApprover) {
        if (commentArgs.length > 0) {
            switch (commentArgs[0]) {
                case 'resolved':
                    try {
                        /* eslint-disable @typescript-eslint/naming-convention */
                        await octokit.issues.lock({
                            ...context.repo,
                            issue_number: issueNumber
                        })
                        /* eslint-enable @typescript-eslint/naming-convention */
                    } catch (e) {
                        throw new Error(`could not lock issue: ${e}`)
                    }
                    break

                case 'off-topic':
                    try {
                        /* eslint-disable @typescript-eslint/naming-convention */
                        await octokit.issues.lock({
                            ...context.repo,
                            issue_number: issueNumber,
                            lock_reason: 'off-topic'
                        })
                        /* eslint-enable @typescript-eslint/naming-convention */
                    } catch (e) {
                        throw new Error(`could not lock issue: ${e}`)
                    }
                    break

                case 'too-heated':
                    try {
                        /* eslint-disable @typescript-eslint/naming-convention */
                        await octokit.issues.lock({
                            ...context.repo,
                            issue_number: issueNumber,
                            lock_reason: 'too heated'
                        })
                        /* eslint-enable @typescript-eslint/naming-convention */
                    } catch (e) {
                        throw new Error(`could not lock issue: ${e}`)
                    }
                    break

                case 'spam':
                    try {
                        /* eslint-disable @typescript-eslint/naming-convention */
                        await octokit.issues.lock({
                            ...context.repo,
                            issue_number: issueNumber,
                            lock_reason: 'spam'
                        })
                        /* eslint-enable @typescript-eslint/naming-convention */
                    } catch (e) {
                        throw new Error(`could not lock issue: ${e}`)
                    }
                    break

                default:
                    try {
                        /* eslint-disable @typescript-eslint/naming-convention */
                        await octokit.issues.lock({
                            ...context.repo,
                            issue_number: issueNumber
                        })
                        /* eslint-enable @typescript-eslint/naming-convention */
                    } catch (e) {
                        throw new Error(`could not lock issue: ${e}`)
                    }
                    break
            }
        } else {
            try {
                /* eslint-disable @typescript-eslint/naming-convention */
                await octokit.issues.lock({
                    ...context.repo,
                    issue_number: issueNumber
                })
                /* eslint-enable @typescript-eslint/naming-convention */
            } catch (e) {
                throw new Error(`could not lock issue: ${e}`)
            }
        }
    } else {
        throw new Error(`commenter is not a collaborator user`)
    }
}
