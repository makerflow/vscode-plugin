// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const heartbeats = require('./heartbeats');
const makerflow = require('./makerflow');
const util = require('util');
const exec = util.promisify(require('child_process').exec);


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

async function activate(context) {
	try {
		await exec('makerflow help')
	} catch(e) {
		vscode.window.showInformationMessage('makerflow CLI is not installed.',
		{
			modal: true,
		},
		['Install now', 'Later']).then(selection => {
			if (selection === 'Install now') {
				const terminal = vscode.window.createTerminal('makerflow')
				terminal.sendText('npm install -g makerflow')
				terminal.show(true)
			}
		});
	}
	makerflow.setContext(context)
	const toggleFlowModeCommandId = "makerflow.toggleFlowMode";
	vscode.commands.registerCommand(toggleFlowModeCommandId, makerflow.toggleFlowMode);
	const startBreakModeCommandId = "makerflow.startBreak";
	vscode.commands.registerCommand(startBreakModeCommandId, makerflow.startBreak);
	const stopBreakModeCommandId = "makerflow.stopBreak";
	vscode.commands.registerCommand(stopBreakModeCommandId, makerflow.stopBreak);
	const startLunchBreakModeCommandId = "makerflow.startLunchBreak";
	vscode.commands.registerCommand(startLunchBreakModeCommandId, function () { makerflow.startBreak('lunch') });
	const startCoffeeBreakModeCommandId = "makerflow.startCoffeeBreak";
	vscode.commands.registerCommand(startCoffeeBreakModeCommandId, function () { makerflow.startBreak('coffee') });
	const startTeaBreakModeCommandId = "makerflow.startTeaBreak";
	vscode.commands.registerCommand(startTeaBreakModeCommandId, function () { makerflow.startBreak('tea') });
	const startBeverageBreakModeCommandId = "makerflow.startBeverageBreak";
	vscode.commands.registerCommand(startBeverageBreakModeCommandId, function () { makerflow.startBreak('beverage') });
	const startWalkBreakModeCommandId = "makerflow.startWalkBreak";
	vscode.commands.registerCommand(startWalkBreakModeCommandId, function () { makerflow.startBreak('walk') });
	const flowModeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	const clickMakerflowStatusBarCommandId = "makerflow.clickStatusBar";
	vscode.commands.registerCommand(clickMakerflowStatusBarCommandId, makerflow.clickStatusBar);
	flowModeStatusItem.command = clickMakerflowStatusBarCommandId;

	
	
	flowModeStatusItem.text = "Flow Mode: Off";
	makerflow.setStatusBarItem(flowModeStatusItem);
	if (vscode.workspace.getConfiguration('makerflow').showStatus) {
		flowModeStatusItem.show();
	}
	
	const listTasksCommandId = "makerflow.listTasks";
	vscode.commands.registerCommand(listTasksCommandId, makerflow.listTasks);
	const tasksStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	tasksStatusItem.command = listTasksCommandId;
	tasksStatusItem.text = "Loading tasks..."
	if (vscode.workspace.getConfiguration('makerflow').showTasksTodoStatusItem) {
		tasksStatusItem.show();
	}
	makerflow.setTasksStatusBarItem(tasksStatusItem);
	const calendarStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	calendarStatusItem.text = "Loading events..."
	if (vscode.workspace.getConfiguration('makerflow').showCalendarStatusItem) {
		calendarStatusItem.show();
	}
	makerflow.setCalendarStatusBarItem(calendarStatusItem);

	makerflow.getAndProcessOngingFlow();
	setInterval(makerflow.getAndProcessOngingFlow, 10000);
	setInterval(makerflow.getAndProcessOngoingBreak, 10000);
	setInterval(makerflow.updateElapsedTimeOnStatusBar, 60000);

	setInterval(makerflow.fetchTasksAndProcess, 10000);
	setInterval(makerflow.fetchCalendarEventsAndProcess, 10000);

	setInterval(heartbeats.processHeartbeats, 30000);
	vscode.window.onDidChangeActiveTextEditor(heartbeats.heartbeat)
	vscode.window.onDidOpenTerminal(heartbeats.heartbeat)
	vscode.workspace.onDidCloseTextDocument(heartbeats.heartbeat)
	vscode.window.onDidChangeActiveTerminal(heartbeats.heartbeat)
	vscode.window.onDidChangeTextEditorSelection(heartbeats.heartbeat)
	vscode.window.onDidChangeVisibleTextEditors(heartbeats.heartbeat)
	vscode.workspace.onDidChangeTextDocument(heartbeats.heartbeat)
	vscode.workspace.onDidChangeWorkspaceFolders(heartbeats.heartbeat)
	vscode.workspace.onDidCloseTextDocument(heartbeats.heartbeat)
	vscode.workspace.onDidOpenTextDocument(heartbeats.heartbeat)
	vscode.workspace.onDidCreateFiles(heartbeats.heartbeat)
	vscode.workspace.onDidDeleteFiles(heartbeats.heartbeat)
	vscode.workspace.onDidSaveTextDocument(heartbeats.heartbeat)
	vscode.workspace.onDidRenameFiles(heartbeats.heartbeat)
	
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
