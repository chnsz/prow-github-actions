import {Context} from "@actions/github/lib/context";
import * as github from "@actions/github";
import * as core from "@actions/core";
import {Octokit} from "@octokit/rest";
import {OctokitWrap} from "./utils/octokit";

export const LGTM_LABEL = 'LGTM';
export const APPROVED_LABEL = 'approved';
export const NEED_REBASE_LABEL = 'needs-rebase';
export const HOLD_LABEL = 'hold';

export const ROBOT_NAME = 'github-ci-robot';

export function isRobot(context: Context = github.context): boolean {
    const commenterLogin: string = context.payload.comment?.user.login

    return !!(commenterLogin && commenterLogin == getRobotName());
}

export const getRobotName = (): String => {
    const token = core.getInput('robot-name', {required: false})
    return token || ROBOT_NAME;
}

export async function wait(seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve(); // 在指定的毫秒数后，将 Promise 标记为已完成
        }, seconds * 1000);
    });
}
