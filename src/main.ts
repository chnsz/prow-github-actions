import * as core from '@actions/core'
import * as github from '@actions/github'
import {handleIssueComment} from './issueComment/handleIssueComment'
import {handlePullReq} from './pullReq/handlePullReq'
import {handleCronJobs} from './cronJobs/handleCronJob'

async function run(): Promise<void> {
    try {
        switch (github.context.eventName) {
            case 'issue_comment':
                await handleIssueComment()
                break
            case 'pull_request_target':
                await handlePullReq()
                break
            case 'pull_request':
                await handlePullReq()
                break
            case 'schedule':
                await handleCronJobs()
                break
            default:
                core.error(`${github.context.eventName} not yet supported`)
                break
        }
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message)
    }
}

run()
