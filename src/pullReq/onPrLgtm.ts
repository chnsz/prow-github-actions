import {Context} from '@actions/github/lib/context'
import * as core from '@actions/core'
import {getCurrentLabels, labelIssue, removeLabels} from '../utils/labeling'
import {APPROVED_LABEL, LGTM_LABEL} from "../constant";
import {checkNeedsRebase} from "../cronJobs/lgtm";
import {checkAuthorizedByOwners} from "../utils/auth";
import {createComment} from "../utils/comments";
import {commandTip} from "../issueComment/approve";

/**
 * Removes the 'lgtm' label after a pull request event
 *
 * @param context - The github actions event context
 */
export const onPrLgtm = async (context: Context): Promise<void> => {
    const prNumber: number | undefined = context.payload.pull_request?.number

    if (prNumber === undefined) {
        throw new Error(
            `github context payload missing pr number: ${context.payload}`
        )
    }
    const labels: { name?: string }[] | undefined = context.payload.pull_request?.labels
    if (labels === undefined) {
        core.error("failed to get labels from PR #" + prNumber)
    }

    try {
        core.debug(`remove-lgtm: found labels for issue ${labels}`)
        if (labels?.map(e => e.name).includes(LGTM_LABEL)) {
            await removeLabels(context, prNumber, [LGTM_LABEL])
        }
    } catch (e) {
        throw new Error(`could not get labels from issue: ${e}`)
    }

    /*try {
        await autoApprove(context)
        await checkNeedsRebase(context, prNumber)
    } catch (e) {
        const msg = `Cannot query PR detail because ${e}`
        core.error(msg)
        throw e
    }*/
}

export const autoApprove = async (context: Context): Promise<void> => {
    const prAuthor: string | undefined = context.payload.pull_request?.user?.login
    const prNumber: number | undefined = context.payload.pull_request?.number
    const labels: { name?: string }[] | undefined = context.payload.pull_request?.labels
    if (labels === undefined) {
        core.error("failed to get labels from PR #" + prNumber)
    }
    if (labels?.map(e => e.name).includes(APPROVED_LABEL)) {
        return
    }

    try {
        if (!prNumber) {
            core.error('prNumber undefined, skip check for automatic approval')
            return
        }
        if (!prAuthor) {
            core.error('PR author is undefined, skip check for automatic approval on PR #' + prNumber)
            return
        }

        const isApprover = await checkAuthorizedByOwners(context, prAuthor, 'approvers');
        if (isApprover) {
            await labelIssue(context, prNumber, [APPROVED_LABEL])
            const msg = "[APPROVALNOTIFIER] This PR is **APPROVED**\n\n" +
                "This PR has been approved by: @" + prAuthor + "\n\n" + commandTip
            await createComment(context, prNumber, msg)
        }
    } catch (e) {
        core.error(`failed to check for automatic approval on PR #${prNumber}, error: ${e}`)
    }
}
