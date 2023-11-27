import * as core from '@actions/core'
import {Context} from '@actions/github/lib/context'

import yaml from 'js-yaml'
import {newOctokit} from "./octokit";

/**
 * checkOrgMember will check to see if the given user is a repo org member
 *
 * @param context - the github actions event context
 * @param user - the users to check auth on
 */
export const checkOrgMember = async (context: Context, user: string): Promise<boolean> => {
    try {
        if (context.payload.repository === undefined) {
            core.debug(`checkOrgMember error: context payload repository undefined`)
            return false
        }

        await newOctokit().orgs.checkMembershipForUser({
            org: context.payload.repository.owner.login,
            username: user
        })

        return true
    } catch (e) {
        return false
    }
}

/**
 * checkCollaborator checks to see if the given user is a repo collaborator
 *
 * @param context - the github actions event context
 * @param user - the users to check auth on
 */
export const checkCollaborator = async (context: Context, user: string): Promise<boolean> => {
    try {
        await newOctokit().repos.checkCollaborator({
            ...context.repo,
            username: user
        })

        return true
    } catch (e) {
        return false
    }
}

/**
 * checkIssueComments will check to see if the given user
 * has commented on the given issue
 *
 * @param context - the github actions event context
 * @param issueNum - the issue or pr number this runtime is associated with
 * @param user - the users to check auth on
 */
export const checkIssueComments = async (context: Context, issueNum: number, user: string): Promise<boolean> => {
    try {
        /* eslint-disable @typescript-eslint/naming-convention */
        const comments = await newOctokit().issues.listComments({
            ...context.repo,
            issue_number: issueNum
        })
        /* eslint-enable @typescript-eslint/naming-convention */

        for (const e of comments.data) {
            if (e.user?.login === user) {
                return true
            }
        }

        return false
    } catch (e) {
        return false
    }
}

/**
 * getOrgCollabCommentUsers will return an array of users who are org members,
 * repo collaborators, or have commented previously
 *
 * @param context - the github actions event context
 * @param issueNum - the issue or pr number this runtime is associated with
 * @param args - the users to check auth on
 */
export const getOrgCollabCommentUsers = async (context: Context, issueNum: number, args: string[]): Promise<string[]> => {
    const toReturn: string[] = []

    try {
        await Promise.all(
            args.map(async arg => {
                const isOrgMember = await checkOrgMember(context, arg)
                const isCollaborator = await checkCollaborator(context, arg)
                const hasCommented = await checkIssueComments(
                    context,
                    issueNum,
                    arg
                )

                if (isOrgMember || isCollaborator || hasCommented) {
                    toReturn.push(arg)
                }
            })
        )
    } catch (e) {
        throw new Error(`could not get authorized user: ${e}`)
    }

    return toReturn
}

/**
 * checkCommenterAuth will return true
 * if the user is a org member, a collaborator, or has commented previously
 *
 * @param context - the github actions event context
 * @param issueNum - the issue or pr number this runtime is associated with
 * @param user - the users to check auth on
 */
export const checkCommenterAuth = async (context: Context, issueNum: number, user: string): Promise<Boolean> => {
    let isOrgMember: Boolean = false
    let isCollaborator: Boolean = false
    let hasCommented: Boolean = false

    try {
        isOrgMember = await checkOrgMember(context, user)
    } catch (e) {
        throw new Error(`error in checking org member: ${e}`)
    }

    try {
        isCollaborator = await checkCollaborator(context, user)
    } catch (e) {
        throw new Error(`could not check collaborator: ${e}`)
    }

    try {
        hasCommented = await checkIssueComments(context, issueNum, user)
    } catch (e) {
        throw new Error(`could not check issue comments: ${e}`)
    }

    return isOrgMember || isCollaborator || hasCommented;
}

export const checkAuthorizedByOwners = async (context: Context, username: string, role: string,): Promise<boolean> => {
    try {
        const owners = await retrieveOwnersFile(context)
        if (owners === '') {
            return false
        }
        if (!isInOwnersFile(owners, role, username)) {
            console.error(`${username} is not included in the ${role} role in the OWNERS file`)
            return false
        }
        return true
    } catch (e) {
        console.error(`error in checkAuthorizedByOwners ${e}`)
    }
    return false
}

/**
 * When an OWNERS file is present, use it to authorize the action
 otherwise fall back to allowing organization members and collaborators
 * @param context - the github actions event context
 * @param role is the role to check
 * @param username is the user to authorize
 */
export const assertAuthorizedByOwnersOrMembership = async (context: Context, role: string, username: string): Promise<void> => {
    core.debug('Checking if the user is authorized to interact with prow')
    const owners = await retrieveOwnersFile(context)

    let isInOwner = false
    if (owners !== '') {
        isInOwner = isInOwnersFile(owners, role, username)
    }
    if (isInOwner) {
        return
    }

    const isOrgMember = await checkOrgMember(context, username)
    const isCollaborator = await checkCollaborator(context, username)

    if (!isOrgMember && !isCollaborator) {
        throw new Error(`${username} is not included in the ${role} role in the OWNERS file and is not an organization member or collaborator`)
    }
}

/**
 * Retrieve the contents of the OWNERS file at the root of the repository.
 * If the file does not exist, returns an empty string.
 */
async function retrieveOwnersFile(context: Context): Promise<string> {
    core.debug(`Looking for an OWNERS file at the root of the repository`)
    const octokit = newOctokit()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = undefined
    try {
        const response = await octokit.repos.getContent({
            ...context.repo,
            path: 'OWNERS'
        })
        data = response.data
    } catch (e) {
        if (typeof e === 'object' && e && 'status' in e && e.status === 404) {
            core.debug('No OWNERS file found')
            return ''
        }

        throw new Error(
            `error checking for an OWNERS file at the root of the repository: ${e}`
        )
    }

    if (!data.content || !data.encoding) {
        throw new Error(`invalid OWNERS file returned from GitHub API: ${data}`)
    }

    const decoded = Buffer.from(data.content, data.encoding).toString()
    core.debug(`OWNERS file contents: ${decoded}`)
    return decoded
}

/**
 * Determine if the user has the specified role in the OWNERS file.
 * @param ownersContents - the contents of the OWNERS file
 * @param role - the role to check
 * @param username - the user to authorize
 */
function isInOwnersFile(ownersContents: string, role: string, username: string): boolean {
    core.debug(`checking if ${username} is in the ${role} in the OWNERS file`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownersData: any = yaml.load(ownersContents)

    username = username.toLowerCase()
    const roleMembers = ownersData[role]
    if ((roleMembers as string[]) !== undefined) {
        return roleMembers.indexOf(username) > -1
    }

    core.info(`${username} is not in the ${role} role in the OWNERS file`)
    return false
}
