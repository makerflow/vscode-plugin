const config = require('./config');
const vscode = require('vscode');
const utcToZonedTime = require('date-fns-tz/utcToZonedTime');
const zonedTimeToUtc = require('date-fns-tz/zonedTimeToUtc');
const formatDistanceToNowStrict = require('date-fns/formatDistanceToNowStrict');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const todoUtils = require('./todo-utils');
const eventUtils = require('./event-utils');
const pluralize = require('pluralize');
const { groupBy } = require('lodash');

let context = null;
let statusBarItem = null;
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let tasksStatusItem = null;
let calendarStatusItem = null;

const beginFlowMode = async function () {

    if (getSavedFlowMode() !== null) return;
    await config.warnAboutApiTokenAvailability();
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable && vscode.workspace.getConfiguration('makerflow').doNotAskForApiToken)  {
        behaveAsInFlowMode();
    } else if (apiTokenAvailable) {
        statusBarItem.text = "Flow Mode: Starting..."
        exec("makerflow start --json --source=vscode", (error, stdout, stderr) => {
            if (error) {
                console.error(error);
                statusBarItem.text = "Flow Mode: Off"
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                statusBarItem.text = "Flow Mode: Off"
                return;
            }
            if (cliRespondedWithApiTokenUnavailable(stdout)) {
                behaveAsInFlowMode(null);
            } else {
                const response = JSON.parse(sanitizeCliOutput(stdout, true));
                behaveAsInFlowMode(response.data);
            }
        });
    }
}

const endFlowMode = async function() {
    if (getSavedFlowMode() === null) return;
    await config.warnAboutApiTokenAvailability();
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable && vscode.workspace.getConfiguration('makerflow').doNotAskForApiToken) {
        behaveAsNOTInFlowMode();
    } else if (apiTokenAvailable) {
        statusBarItem.text = "Flow Mode: Stopping..."
        const {error, stderr} = await exec("makerflow stop --json --source=vscode")
        if (error) {
            console.error(error);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        behaveAsNOTInFlowMode();
    }
}

const getOngoingFlowMode = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return null;
    const {error, stdout, stderr} = await exec("makerflow ongoing --json --source=vscode")
    if (error) {
        console.error(error);
        return null;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return null;
    }
    if (cliRespondedWithApiTokenUnavailable(stdout)) {
        return null
    }
    const newLocal = sanitizeCliOutput(stdout, true);
    const response = JSON.parse(newLocal);
    return response != null && response.hasOwnProperty("data") ? response.data : null
}

const getAndProcessOngoingFlow = function() {
    getOngoingFlowMode().then(flowMode => {
        if (typeof flowMode !== 'undefined' && flowMode !== null) {
            if (getSavedFlowMode() !== null) {
                updateElapsedTimeOnStatusBar();
                return;
            }
            behaveAsInFlowMode(flowMode);
        } else {
            if (getSavedFlowMode() === null) return;
            behaveAsNOTInFlowMode();
        }
    })
}

const getOngoingBreakMode = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return null;
    const {error, stdout, stderr} = await exec("makerflow break ongoing --json --source=vscode")
    if (error) {
        console.error(error);
        return null;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return null;
    }
    if (cliRespondedWithApiTokenUnavailable(stdout)) {
        return null
    }
    const newLocal = sanitizeCliOutput(stdout, true);
    const response = JSON.parse(newLocal);
    return response != null && response ? response : null
}

const getAndProcessOngoingBreak = function() {
    getOngoingBreakMode().then(breakMode => {
        if (typeof breakMode !== 'undefined' && breakMode !== null) {
            if (getSavedBreakMode() !== null) {
                updateElapsedTimeOnStatusBar();
                return;
            }
            behaveAsInBreakMode(breakMode);
        } else {
            if (getSavedBreakMode() === null) return;
            behaveAsNOTInBreakMode();
        }
    })
}

const toggleFlowMode = async function() {
    statusBarItem.text = "Flow Mode: Toggling..."
    if (await getOngoingFlowMode() === null) {
        beginFlowMode();
    } else {
        endFlowMode();
    }
}

const setContext = function (extensionContext) {
    context = extensionContext;
}


const showFlowModeStartedNotification = function() {
    const configVscode = vscode.workspace.getConfiguration('makerflow');
    if (configVscode.doNotShowFlowModeNotification) return;
    const dontShowAgainOption = "Don't show again";
    const stopOption = "Stop";
    vscode.window.showInformationMessage("Flow Mode running",
        stopOption, dontShowAgainOption)
        .then(option => {
            if (option === dontShowAgainOption) {
                configVscode.update("doNotShowFlowModeNotifications", true, true);
            }
            if (option === stopOption) {
                endFlowMode();
            }
        });
}

const showFlowModeEndedNotification = function() {
    const configVscode = vscode.workspace.getConfiguration('makerflow');
    if (configVscode.doNotShowFlowModeNotification) return;
    const dontShowAgainOption = "Don't show again";
    vscode.window.showInformationMessage("Flow Mode ended",
        dontShowAgainOption)
        .then(option => {
            if (option === dontShowAgainOption) {
                configVscode.update("doNotShowFlowModeNotifications", true, true);
            }
        });
}

const setStatusBarItem = function(providedStatusBarItem) {
    statusBarItem = providedStatusBarItem;
}

const setTasksStatusBarItem = function(providedStatusBarItem) {
    tasksStatusItem = providedStatusBarItem;
}

const setCalendarStatusBarItem = function(providedStatusBarItem) {
    calendarStatusItem = providedStatusBarItem;
}

const updateElapsedTimeOnStatusBar = function() {
    let flowMode = getSavedFlowMode()
    let breakMode = getSavedBreakMode();
    if ((flowMode === null || Object.keys(flowMode).length === 0) 
        && (breakMode === null || Object.keys(breakMode).length === 0)) return;
    const prefix = flowMode === null ? "On Break: " : "Flow Mode: ";
    statusBarItem.text = prefix + getElapsedTime(flowMode === null ? breakMode : flowMode);
}

const startBreak = async function(reason) {
    await config.warnAboutApiTokenAvailability();
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable && vscode.workspace.getConfiguration('makerflow').doNotAskForApiToken)  {
        return;
    } else if (apiTokenAvailable) {
        statusBarItem.text = "Starting Break..."
        exec(`makerflow break start --json${reason ? ' --reason=' + reason : ''}  --source=vscode`, (error, stdout, stderr) => {
            if (error) {
                console.error(error);
                statusBarItem.text = "Error when starting break"
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                statusBarItem.text = "Error when starting break"
                return;
            }
            if (cliRespondedWithApiTokenUnavailable(stdout)) {
                statusBarItem.text = "Cannot start break without API token"
                return;
            } else {
                const response = JSON.parse(sanitizeCliOutput(stdout, true));
                behaveAsInBreakMode(response);
            }
        });
    }
}

const stopBreak = async function() {
    await config.warnAboutApiTokenAvailability();
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable && vscode.workspace.getConfiguration('makerflow').doNotAskForApiToken)  {
        return;
    } else if (apiTokenAvailable) {
        statusBarItem.text = "Stopping Break..."
        exec(`makerflow break stop --json --source=vscode`, (error, stdout, stderr) => {
            if (error) {
                console.error(error);
                statusBarItem.text = "Error when stopping break"
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                statusBarItem.text = "Error when stopping break"
                return;
            }
            if (cliRespondedWithApiTokenUnavailable(stdout)) {
                statusBarItem.text = "Cannot stop break without API token"
                return;
            } else {
                const response = JSON.parse(sanitizeCliOutput(stdout, true));
                behaveAsNOTInBreakMode(response.data);
            }
        });
    }
}

const clickStatusBar = function() {
    const savedBreakMode = getSavedBreakMode();
    if (savedBreakMode !== null && Object.keys(savedBreakMode).length > 0) {
        stopBreak();
    } else {
        toggleFlowMode();
    }
}

const fetchTasks = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return [];
    const { error, stdout, stderr } = await exec(`makerflow tasks todo --json --source=vscode`)
    if (error) {       
    console.error(error);
        return [];
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return [];
    }
    const newLocal = sanitizeCliOutput(stdout, true);
    const response = JSON.parse(newLocal);
    return response != null ? response : []
}

const fetchTasksAndProcess = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return;
    const tasks = await fetchTasks();
    if (tasks.length === 0) {
        tasksStatusItem.text = "No new tasks"
        context.globalState.update('todos', []);
        return;
    }
    tasks.forEach(t => todoUtils.enrichTodo(t));
    context.globalState.update('todos', tasks);
    let text = tasks.length + " new " + pluralize("tasks", tasks.length) + " - "
    const slackTasks = tasks.filter(todoUtils.isSlackTodo);
    let requireSeparator = false;
    if (slackTasks.length > 0) {
        text += "Slack: " + slackTasks.length;
        requireSeparator = true;
    }
    const githubTasks = tasks.filter(todoUtils.isGithubTodo);
    if (githubTasks.length > 0) {
        if (requireSeparator) text += " | ";
        text += "Github: " + githubTasks.length;
        requireSeparator = true;
    }
    const bitbucketTasks = tasks.filter(todoUtils.isBitbucketTodo);
    if (bitbucketTasks.length > 0) {
        if (requireSeparator) text += " | ";
        text += "Bitbucket: " + bitbucketTasks.length;
        requireSeparator = true;
    }
    tasksStatusItem.text = text;
}

const fetchCalendarEvents = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return [];
    const { error, stdout, stderr } = await exec(`makerflow events list --json --source=vscode`)
    if (error) {
        console.error(error);
        return [];
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return [];
    }
    const newLocal = sanitizeCliOutput(stdout, true);
    const response = JSON.parse(newLocal);
    return response != null && response.hasOwnProperty("events") ? response.events : []
}

const fetchCalendarEventsAndProcess = async function() {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return;
    const events = await fetchCalendarEvents();
    if (events.length === 0) {
        calendarStatusItem.text = "No upcoming calendar events"
        context.globalState.update('calendarEvents', []);
        return;
    }
    context.globalState.update('calendarEvents', events);
    const groups = groupBy(events, eventUtils.calendarEventOngoingUpcoming);
    let text = "Calendar - ";
    let requireSeparator = false;
    Object.keys(groups).forEach(function(key) {
        if (requireSeparator) text += " | ";
        text += key + ": " + groups[key].length;
        requireSeparator = true;
    });
    calendarStatusItem.text = text;
}

const listTasks = async function() {
    const tasks = context.globalState.get('todos');
    if (tasks.length === 0) return;
    tasks.forEach(t => todoUtils.enrichTodo(t));
    const quickPickItems = tasks.map(todoUtils.createQuickPickItem);
    const item = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: "Select a task"
    });
    if (!item) return;
    todoUtils.executeAction(item.todo, markAsDone);
}

const listEvents = async function() {
    const events = context.globalState.get('calendarEvents');
    if (events.length === 0) return;
    const quickPickItems = events.map(eventUtils.createQuickPickItem);
    const item = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: "Select an event"
    });
    if (!item) return;
    eventUtils.executeAction(item.event);
}

const markAsDone = async function(todo) {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return;
    const { error, stdout, stderr } = await exec(`makerflow todo done ${JSON.stringify(todo)} --json --source=vscode`)
    if (error) {
        console.error(error);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    const newLocal = sanitizeCliOutput(stdout, true);
    return JSON.parse(newLocal);
}

const recordProductiveActivity = async function(min, max) {
    const apiTokenAvailable = await config.isApiTokenAvailable();
    if (!apiTokenAvailable) return;
    const { error, stdout, stderr } = await exec(`makerflow productive-activity --min=${min} --max=${max}`)
    if (error) {
        console.error(error);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    if (stdout) {
        console.log(`stdout: ${stdout}`);
        return;
    }
}

module.exports = {
    beginFlowMode,
    endFlowMode,
    setContext,
    toggleFlowMode,
    showFlowModeStartedNotification,
    showFlowModeEndedNotification,
    setStatusBarItem,
    setTasksStatusBarItem,
    setCalendarStatusBarItem,
    getAndProcessOngingFlow: getAndProcessOngoingFlow,
    updateElapsedTimeOnStatusBar,
    startBreak,
    stopBreak,
    getAndProcessOngoingBreak,
    clickStatusBar,
    fetchTasks,
    fetchTasksAndProcess,
    fetchCalendarEventsAndProcess,
    listTasks,
    recordProductiveActivity,
    listEvents
}

/**
 *
 * @param {string} stdout
 * @param {boolean} expectJson
 * @returns {string} sanitized output
 */
function sanitizeCliOutput(stdout, expectJson) {
    const newLocal = stdout.replaceAll('[0m', '');
    let newLocal_1 = newLocal.trim();
    if (stdout.length === 0) return stdout
    if (expectJson && !(newLocal_1.charAt(0) === '{' || newLocal_1.charAt(0) === '[')) {
        newLocal_1 = newLocal_1.substring(1)
    }
    if (expectJson && stdout.length > 0 && !(newLocal_1.charAt(newLocal_1.length - 1) === '{' || newLocal_1.charAt(newLocal_1.length - 1) === '[')) {
        newLocal_1 = newLocal_1.substring(0, newLocal_1.length - 1)
    }
    return newLocal_1;
}

function cliRespondedWithApiTokenUnavailable(stdout) {
    return stdout.indexOf("API token not available") !== -1;
}

function getSavedFlowMode() {
    return context.globalState.get('ongoingFlowMode', null);
}

function getSavedBreakMode() {
    return context.globalState.get('ongoingBreakMode', null);
}

function behaveAsNOTInFlowMode() {
    showFlowModeEndedNotification();
    context.globalState.update('ongoingFlowMode', null);
    statusBarItem.text = "Flow Mode: Off";
}

function behaveAsNOTInBreakMode() {
    context.globalState.update('ongoingBreakMode', null);
    if (statusBarItem.text.indexOf("Break") !== -1) {
        statusBarItem.text = "Flow Mode: Off";
    }
}

function behaveAsInFlowMode(flowMode) {
    showFlowModeStartedNotification();
    if (typeof flowMode === "undefined" || flowMode === null) {
        flowMode = {
            start:  zonedTimeToUtc(Date.now(), timeZone)
        }
    }
    context.globalState.update('ongoingFlowMode', flowMode);
    updateElapsedTimeOnStatusBar();
    tasksStatusItem.text = "End flow mode to see tasks and notifications";
}

function behaveAsInBreakMode(breakMode) {
    if (typeof breakMode === "undefined" || breakMode === null) {
        breakMode = {
            start:  zonedTimeToUtc(Date.now(), timeZone)
        }
    }
    context.globalState.update('ongoingBreakMode', breakMode);
    updateElapsedTimeOnStatusBar();
}

function getElapsedTime(flowMode) {
    return formatDistanceToNowStrict(utcToZonedTime(flowMode.start, timeZone));
}
