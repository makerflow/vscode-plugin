const vscode = require('vscode');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const warnAboutApiTokenAvailability = async function () {
    const config = vscode.workspace.getConfiguration('makerflow');
    const apiTokenAvailable = await isApiTokenAvailable();
    if (apiTokenAvailable || config.doNotAskForApiToken) return;
    const setTokenOption = "Set token";
    const dontAskAgainOption = "Don't ask again";
    vscode.window.showWarningMessage("Makerflow API token missing", 
    {detail: 'You can get a new token from https://app.makerflow.co/settings#api', modal: true},
        setTokenOption, dontAskAgainOption)
        .then(option => {
            if (option === dontAskAgainOption) {
                config.update("doNotAskForApiToken", true, true);
            } else if (option === setTokenOption) {
                promptForApiToken();
            }
        });
}

async function isApiTokenAvailable() {
    const { error, stdout, stderr } = await exec("makerflow config token --check")
    if (error) {
        console.error(error);
        return false;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return false;
    }
    const output = stdout.trim()
    return output.indexOf('true') !== -1
}

function promptForApiToken() {
    vscode.window.showInputBox({
        "password": true,
        "placeHolder": "Your Makerflow API token",
        "prompt": "Set API token for Makerflow. Go to https://app.makerflow.co/settings#/api to create one."
    }).then(value => {
        if (typeof value === "undefined" || value.length === 0)
            return;
        exec("makerflow config token --value=" + value)
    });
}

module.exports = {
    warnAboutApiTokenAvailability,
    isApiTokenAvailable,
    promptForApiToken
}