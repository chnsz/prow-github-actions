import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'
import * as core from '@actions/core'
import {Endpoints} from '@octokit/types'
import * as yaml from 'js-yaml'
import * as minimatch from 'minimatch'
import {newOctokit} from "../utils/octokit";

// This variable is used to track number of jobs processed
// while recursing through pages of the github api
let jobsDone = 0

type PullsListResponseDataType = Endpoints['GET /repos/{owner}/{repo}/pulls']['response']['data']

/**
 * Inspired by https://github.com/actions/stale
 * this will recurse through the pages of PRs for a repo returned
 * by the github API.
 *
 * @param currentPage - the page to return from the github api
 * @param context - The github actions event context
 */
export const cronLabelPr = async (currentPage: number, context: Context): Promise<number> => {
    core.info(`starting PR labeler page ${currentPage}`)

    // Get next batch
    let prs: PullsListResponseDataType
    try {
        prs = await getPrs(context, currentPage)
    } catch (e) {
        throw new Error(`could not get PRs: ${e}`)
    }

    if (prs.length <= 0) {
        // All done!
        return jobsDone
    }

    await Promise.all(
        prs.map(async pr => {
            core.info(`processing pr: ${pr.number}`)
            if (pr.state === 'closed') {
                return
            }

            if (pr.state === 'locked') {
                return
            }

            await labelPr(pr.number, context)
            jobsDone++
        })
    )

    // Recurse, continue to next page
    return cronLabelPr(currentPage + 1, context)
}

/**
 * grabs pulls from github in baches of 100
 *
 * @param context - the github actions workflow context
 * @param page - the page number to get from the api
 */
const getPrs = async (context: Context = github.context, page: number): Promise<PullsListResponseDataType> => {
    core.debug(`getting prs page ${page}...`)
    const prResults = await newOctokit().pulls.list({
        ...context.repo,
        page
    })

    core.debug(`got: ${prResults.data}`)

    return prResults.data
}

/**
 * Inspired by https://github.com/actions/labeler
 *    - Uses js-yaml to load labeler.yaml
 *    - Uses Minimatch to match globs to changed files
 * @param context - the Github context for pull req event
 * @param prNum - the PR to label
 */
const labelPr = async (prNum: number, context: Context = github.context): Promise<void> => {
    const changedFiles = await getChangedFiles(context, prNum)
    const labels = await getLabelsFromFileGlobs(context, changedFiles)

    if (labels.length === 0) {
        core.debug('pr-labeler: no labels matched file globs')
        return
    }

    await sendLabels(context, prNum, labels)
}

/**
 * returns the changed files for the PR
 *
 * @param context - the github workflows event context
 * @param prNum - the PR to check
 */
const getChangedFiles = async (context: Context, prNum: number): Promise<string[]> => {
    core.debug(`getting changed files for pr ${prNum}`)
    const octokit = newOctokit()
    /* eslint-disable @typescript-eslint/naming-convention */
    const listFilesResponse = await octokit.pulls.listFiles({
        ...context.repo,
        pull_number: prNum
    })
    /* eslint-enable @typescript-eslint/naming-convention */

    const changedFiles = listFilesResponse.data.map(f => f.filename)
    core.debug(`files changed: ${changedFiles}`)

    return changedFiles
}

/**
 * Will match the globs found in /.github/workflows.yaml
 * with the files that have changed in the PR
 *
 * @param context - the github workflows event context
 * @param files - the list of files that have changed in the PR
 */
const getLabelsFromFileGlobs = async (context: Context, files: string[]): Promise<string[]> => {
    const toReturn: string[] = []
    const octokit = newOctokit()

    core.debug(`getting labels.yaml file and matching file globs`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any = undefined
    try {
        response = await octokit.rest.repos.getContent({
            ...context.repo,
            path: '.github/labels.yaml'
        })
    } catch (e) {
        try {
            response = await octokit.rest.repos.getContent({
                ...context.repo,
                path: '.github/labels.yml'
            })
        } catch (e2) {
            throw new Error(
                `could not get .github/labels.yaml or .github/labels.yml: ${e} ${e2}`
            )
        }
    }

    if (!response.data.content || !response.data.encoding) {
        throw new Error(
            `area: error parsing data from content response: ${response.data}`
        )
    }

    const decoded = Buffer.from(
        response.data.content,
        response.data.encoding
    ).toString()

    core.debug(`label file contents: ${decoded}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any = yaml.load(decoded)

    const labelMap: Map<string, string[]> = new Map()

    for (const label in content) {
        if (typeof content[label] === 'string') {
            labelMap.set(label, [content[label]])
        } else if (content[label] instanceof Array) {
            labelMap.set(label, content[label])
        } else {
            throw Error(
                `pr-labeler: found unexpected type for label ${label} (should be string or array of globs)`
            )
        }
    }

    for (const [label, globs] of labelMap.entries()) {
        if (checkGlobs(files, globs)) {
            toReturn.push(label)
        }
    }

    return toReturn
}

/**
 * Returns true if a match between the globs and corresponding file changes
 * in the PR
 *
 * @param files - list of files that have changed
 * @param globs - list of globs to match against files
 */
const checkGlobs = (files: string[], globs: string[]): boolean => {
    for (const glob of globs) {
        const matcher = new minimatch.Minimatch(glob)
        for (const file of files) {
            core.debug(`comparing file: ${file} to glob: ${glob}`)
            if (matcher.match(file)) {
                core.debug(`success! Glob and file match`)
                return true
            }
        }
    }
    return false
}

/**
 * Labels a given PR with given labels
 *
 * @param context - the github workflow event context
 * @param prNum - the PR to label
 * @param labels - the labels for the PR
 */
export const sendLabels = async (context: Context, prNum: number, labels: string[]): Promise<void> => {
    const octokit = newOctokit()
    try {
        core.debug(`sending labels ${labels} for PR ${prNum}`)
        /* eslint-disable @typescript-eslint/naming-convention */
        await octokit.issues.addLabels({
            ...context.repo,
            issue_number: prNum,
            labels
        })
        /* eslint-enable @typescript-eslint/naming-convention */
    } catch (e) {
        throw new Error(`sending labels: ${e}`)
    }
}
