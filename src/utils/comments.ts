import {Context} from '@actions/github/lib/context'
import {newOctokit} from "./octokit";

/**
 * createComment comments on the specified issue or pull request
 *
 * @param context - the github actions event context
 * @param issueNum - the issue associated with this runtime
 * @param message - the comment message body
 */
export const createComment = async (
    context: Context,
    issueNum: number,
    message: string
): Promise<void> => {
    try {
        /* eslint-disable @typescript-eslint/naming-convention */
        await newOctokit().issues.createComment({
            ...context.repo,
            issue_number: issueNum,
            body: message
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    } catch (e) {
        throw new Error(`could not add comment: ${e}`)
    }
}
