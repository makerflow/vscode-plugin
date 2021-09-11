const utcToZonedTime = require('date-fns-tz/utcToZonedTime');
const formatDistanceToNowStrict = require('date-fns/formatDistanceToNowStrict');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const _ = require('lodash');
const pluralize = require('pluralize')
const vscode = require('vscode');

function handleCustomTask(todo) {
        const task = todo.task;
        todo.group = `makerflow_${task.title}`;
        todo.description = task.title;
        todo.sourceDescription = null;
}

const handlePullRequestTodos = (todo) => {
    const pr = todo.pr;
    todo.group = `${pr.repository_uuid}_${pr.pullrequest_id}`
    todo.description = `PR #${pr.pullrequest_id}: ${pr.pullrequest_title}`;
    todo.link = pr.link;
    todo.sourceDescription = `${pr.repository_name} | ${pluralize("comments", todo.meta.comments, true)} | ${pluralize("approvals", todo.meta.approvals, true)}`;
}

const handleSlackTodo = (todo) => {
    let thisTodoEvents = todo.events;
    let eventCount = thisTodoEvents.length;
    const sourceCount = new Set(thisTodoEvents.map(e => e.channel_id)).size;
    let sourceType = getSlackSourceType(todo);
    todo.description = `${pluralize('message', eventCount, true)} in ${sourceCount === 1 ? 'a ' : 'multiple '}${pluralize(sourceType, sourceCount)}`;
    let timingDescription = buildTimingDescription(thisTodoEvents);
    if (sourceCount > 1) {
        todo.sourceDescription = `${todo.group} | ${pluralize(sourceType, sourceCount, true)}`;
    } else {
        todo.sourceDescription = `${todo.group}`;
    }
    if ( todo.type === 'slack_channel') {
        todo.sourceDescription += ` | ${_.uniq(thisTodoEvents.map(e => `#${e.channel_name}`)).join(", ")}`;
    }
    todo.sourceDescription += timingDescription
    todo.browserLink = `https://slack.com/app_redirect?channel=${thisTodoEvents[0].channel_id}&team=${thisTodoEvents[0].team_id}`
    todo.link = `slack://channel?id=${thisTodoEvents[0].channel_id}&team=${thisTodoEvents[0].team_id}`
}

const buildTimingDescription = (events) => {
    let createdTimes = events.map(e => e.created_at);
    let latestTime = _.max(createdTimes);
    let latestTimeDescription = formatDistanceToNowStrict(utcToZonedTime(latestTime, timeZone));
    return ` | ${latestTimeDescription}`;
}

const getSlackSourceType = (todo) => {
    let sourceType = '';
    if (todo.type === 'slack_channel') {
        sourceType = 'channel';
    }
    if (todo.type === 'slack_im') {
        sourceType = 'DM';
    }
    if (todo.type === 'slack_mpim') {
        sourceType = 'group DM';
    }
    return sourceType;
}

const enrichTodo = (todo) => {
    if (typeof todo === "undefined" || todo === null) return null;
    todo.done = false;
    if (todo.type.indexOf("slack") !== -1) {
        handleSlackTodo(todo);
    }
    if (todo.type === "bitbucket") {
        handlePullRequestTodos(todo);
    }
    if (todo.type === "github") {
        handlePullRequestTodos(todo);
    }
    if (todo.sourceType === "makerflow" && todo.type === "makerflow") {
        handleCustomTask(todo);
    }
    if (todo.sourceType === "makerflow" && todo.type === "onboarding") {
        return null;
    }
    return todo;
}

const isSlackTodo = (todo) => {
    return todo.type.indexOf("slack") !== -1;
}

const isGithubTodo = (todo) => {
    return todo.type === "github";
}

const isBitbucketTodo = (todo) => {
    return todo.type === "bitbucket";
}

const createQuickPickItem = (todo) => {
    let item = {
        label: todo.description,
        description: todo.sourceDescription,
        todo: todo
    };
    return item;
}

const executeAction = async (todo, functionToMarkAsDone) => {
    if (isSlackTodo(todo) || isGithubTodo(todo) || isBitbucketTodo(todo)) {
        const openDestination = isSlackTodo(todo) ? ' in Slack app' : ' in browser';
        const items = [
            {'label': 'Mark as done', 'description': 'Mark this todo as done', 'todo': todo},
            {'label': 'Open', 'description': `Open ${openDestination}`, 'todo': todo},
        ]
        if (isSlackTodo(todo)) {
            items.push({'label': 'Open in browser', 'description': 'Open this slack workspace in browser', 'todo': todo})
        }
        const choice = await vscode.window.showQuickPick(items, {
            placeHolder: `Mark as done or open ${openDestination}`,
        });
        if (!choice) return;
        if (choice.label === 'Mark as done') {
            await functionToMarkAsDone(todo);
        } else if (choice.label === 'Open') {
            vscode.env.openExternal(vscode.Uri.parse(todo.link));
        } else if (choice.label === 'Open in browser') {
            vscode.env.openExternal(vscode.Uri.parse(todo.browserLink));
        }
    }
}


module.exports = {
    buildTimingDescription,
    getSlackSourceType,
    handleSlackTodo,
    handlePullRequestTodos,
    handleCustomTask,
    enrichTodo,
    isGithubTodo,
    isBitbucketTodo,
    isSlackTodo,
    createQuickPickItem,
    executeAction
}