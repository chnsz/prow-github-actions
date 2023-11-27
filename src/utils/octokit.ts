import {PaginateInterface} from "@octokit/plugin-paginate-rest";
import {RestEndpointMethods} from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types";
import {Api} from "@octokit/plugin-rest-endpoint-methods/dist-types/types";
import {Octokit} from "@octokit/rest";
import * as core from "@actions/core";

export type OctokitWrap = { paginate: PaginateInterface } & RestEndpointMethods & Api & Octokit;

export const newOctokit = (): OctokitWrap => {
    const token = core.getInput('github-token', {required: true})
    return new Octokit({
        auth: token
    })
}
