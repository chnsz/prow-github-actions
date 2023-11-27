import * as github from '@actions/github'
import {Endpoints} from '@octokit/types'
import {Context} from '@actions/github/lib/context'
import * as core from '@actions/core'
import {cancelLabel, labelIssue} from "../utils/labeling";
import {createComment} from "../utils/comments";
import {APPROVED_LABEL, HOLD_LABEL, LGTM_LABEL, NEED_REBASE_LABEL, wait} from "../constant";
import {newOctokit} from "../utils/octokit";

let jobsDone = 0

type PullsListResponseDataType = Endpoints['GET /repos/{owner}/{repo}/pulls']['response']['data']
type PullsListResponseItem = PullsListResponseDataType extends (infer Item)[] ? Item : never

/**
 * Inspired by https://github.com/actions/stale
 * this will recurse through the pages of PRs for a repo
 * and attempt to merge them if they have the "lgtm" label
 *
 * @param currentPage - the page to return from the github api
 * @param context - The github actions event context
 */
export const cronLgtm = async (currentPage: number, context: Context): Promise<number> => {
    console.log(`starting lgtm merger page: ${currentPage}`)
    // Get next batch
    let prs: PullsListResponseDataType
    try {
        prs = await getOpenPrs(context, currentPage)
    } catch (e) {
        throw new Error(`could not get PRs: ${e}`)
    }

    if (prs.length <= 0) {
        // All done!
        return jobsDone
    }
    const results = [];
    for (const pr of prs) {
        await wait(2);
        console.log(`------ Start processing PR #${pr.number} ------------------\n`)
        if (pr.state === 'closed' || pr.state === 'locked') {
            continue;
        }

        try {
            if (await checkNeedsRebase(context, pr.number)) {
                console.log("Skip, this PR needs to be rebase")
                continue;
            }
            await wait(1);
            await tryMergePr(pr, context)
            jobsDone++
        } catch (error) {
            results.push(error);
        }
    }

    for (const result of results) {
        if (result instanceof Error) {
            throw new Error(`error processing pr: ${result}`)
        }
    }

    // Recurse, continue to next page
    return await cronLgtm(currentPage + 1, context)
}

/**
 * grabs pulls from github in baches of 100
 *
 * @param context - the github actions workflow context
 * @param page - the page number to get from the api
 */
const getOpenPrs = async (context: Context = github.context, page: number): Promise<PullsListResponseDataType> => {
    core.debug(`getting prs page ${page}...`)
    const octokit = newOctokit()
    const state: "open" | "closed" | "all" = 'open'
    const prResults = await octokit.pulls.list({
        ...context.repo,
        state: state,
        page
    })

    return prResults.data
}

/**
 * Attempts to merge a PR if it is mergable and has the lgtm label
 *
 * @param pr - the PR to try and merge
 * @param context - the github actions event context
 */
const tryMergePr = async (pr: PullsListResponseItem, context: Context = github.context): Promise<void> => {
    const method = core.getInput('merge-method', {required: false})
    const octokit = newOctokit()

    // if pr has label 'lgtm', attempt to merge
    // but not if it has the 'hold' label
    const isLgtm = pr.labels.map(e => e.name).includes(LGTM_LABEL)
    const isApproved = pr.labels.map(e => e.name).includes(APPROVED_LABEL)
    const isHold = pr.labels.map(e => e.name).includes(HOLD_LABEL)
    const isNeedRebase = pr.labels.map(e => e.name).includes(NEED_REBASE_LABEL)
    console.log(`Try to merge PR\n     approved: ${isApproved}\n         LGTM: ${isLgtm}\n         hold: ${isHold}\n needs-rebase: ${isNeedRebase}\n`)
    if (isNeedRebase || isHold) {
        console.log(`Skip, don't merge, hold: ${isHold}, needs-rebase: ${isNeedRebase}`)
        return
    }

    if (!isLgtm || !isApproved) {
        console.log(`Skip, don't merge, approved: ${isApproved}, LGTM: ${isLgtm}`)
        return
    }

    console.log(`Start merging #${pr.number}, method: ${method}`)
    try {
        switch (method) {
            case 'squash':
                await octokit.pulls.merge({
                    ...context.repo,
                    pull_number: pr.number,
                    commit_title: `${pr.title} (#${pr.number})`,
                    merge_method: 'squash'
                })
                break
            case 'rebase':
                await octokit.pulls.merge({
                    ...context.repo,
                    pull_number: pr.number,
                    merge_method: 'rebase'
                })
                break
            default:
                await octokit.pulls.merge({
                    ...context.repo,
                    pull_number: pr.number,
                    merge_method: 'merge'
                })
        }
        await wait(3);
    } catch (e) {
        core.error(`could not merge pr ${pr.number}: ${e}`)
    }
    return
}

type PullsGetResponseDataType = Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data']

export const getPr = async (context: Context = github.context, pullNumber: number | undefined): Promise<PullsGetResponseDataType> => {
    if (!pullNumber) {
        throw new Error(`Could not query PR detail, because prNumber is ${pullNumber}`)
    }
    const octokit = newOctokit()
    const rsp = await octokit.pulls.get({
        ...context.repo,
        state: 'open',
        pull_number: pullNumber,
    });
    return rsp.data
}

export const checkNeedsRebase = async (context: Context = github.context, prNumber: number | undefined): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
        let pr = await getPr(context, prNumber)
        if (pr.mergeable === null) {
            console.error('Failed to obtain PR detail, try again after 1s')
            await wait(2);
            pr = await getPr(context, prNumber)
        }

        const isNeedsRebase = pr.labels.map(e => e.name).includes(NEED_REBASE_LABEL)
        console.log(`Check mergeable\n     mergeable: ${pr.mergeable}\n  needs-rebase: ${isNeedsRebase}\n`)

        if (pr.mergeable === null) {
            console.error('Failed to check PR mergeable on #' + prNumber)
            return true
        }

        if (pr.mergeable && !isNeedsRebase) {
            return false;
        }

        if (pr.mergeable && isNeedsRebase) {
            core.debug('Remove needs-rebase label on #' + pr.number);
            await cancelLabel(context, pr.number, NEED_REBASE_LABEL);
            return false
        }

        if (!isNeedsRebase) {
            await labelIssue(context, pr.number, [NEED_REBASE_LABEL])
            await createComment(context, pr.number, 'This PR needs rebase.')
        }
        return true
    } catch (e) {
        throw new Error(`Could not add or remove rebase label for PR ${e}`)
    }
}
