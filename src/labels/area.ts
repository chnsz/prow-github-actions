import * as github from '@actions/github'

import {Context} from '@actions/github/lib/context'
import * as core from '@actions/core'

import {getCommandArgs} from '../utils/command'
import {getArgumentLabels, labelIssue, addPrefix} from '../utils/labeling'

/**
 * /area will add an area/some-area label
 *
 * @param context - the github actions event context
 */
export const area = async (
    context: Context = github.context
): Promise<void> => {
    const issueNumber: number | undefined = context.payload.issue?.number
    const commentBody: string = context.payload.comment?.body

    if (issueNumber === undefined) {
        throw new Error(
            `github context payload missing issue number: ${context.payload}`
        )
    }

    let commentArgs: string[] = getCommandArgs('/area', commentBody)

    let areaLabels: string[] = []
    try {
        areaLabels = await getArgumentLabels(context, 'area')
        core.debug(`area: found labels ${areaLabels}`)
    } catch (e) {
        throw new Error(`could not get labels from yaml: ${e}`)
    }

    commentArgs = commentArgs.filter(e => {
        return areaLabels.includes(e)
    })

    commentArgs = addPrefix('area', commentArgs)

    // no arguments after command provided
    if (commentArgs.length === 0) {
        throw new Error(`area: command args missing from body`)
    }

    await labelIssue(context, issueNumber, commentArgs)
}
