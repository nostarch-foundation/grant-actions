module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(104);
/******/ 	};
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 87:
/***/ (function(module) {

module.exports = require("os");

/***/ }),

/***/ 104:
/***/ (function(__unusedmodule, __unusedexports, __webpack_require__) {

const core = __webpack_require__(470);
const github = __webpack_require__(690);
/*
// When a new issue is opened, automatically add it to a GitHub project to facilitate review.
function issue2project(octokit) {
// Trigger: issue opened
// issue context
// https://help.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
// github.context.event is the webhook payload, in this case the issues event payload
// https://developer.github.com/v3/activity/events/types/#issuesevent
const issue = github.context.event.issue;
const owner = issue.repository.owner.login;
const repo = issue.repository.name;

// Cribbing from github-actions-automate-projects
// https://github.com/takanabe/github-actions-automate-projects/blob/master/main.go

// Find project ID
// https://octokit.github.io/rest.js/v17#projects-list-for-repo
// https://developer.github.com/v3/projects/
// https://octokit.github.io/rest.js/v17#pagination
const projectURL = core.getInput('projectURL');
var projectId = 0;
for await (const response of octokit.paginate.iterator(
octokit.projects.listForRepo,{
owner: owner,
repo: repo,
}
)) {
const { data : project } = response;
if (project.html_url == projectURL) { // brittle?
projectID = project.id;
break;
}
}
if (projectID == 0) { core.debug("No such project"); return; }

// Find column ID
// https://octokit.github.io/rest.js/v17#projects-list-columns
// https://developer.github.com/v3/projects/columns/#list-project-columns
const colName = core.getInput('columnName');
var colId = 0;
for await (const response of octokit.paginate.iterator(
octokit.projects.listColumns,{
project_id: projectID,
}
)) {
const { data : column } = response;
if (column.name == colName) { // brittle?
colId = column.id;
break;
}
}
if (colID == 0) { core.debug("No such column"); return; }

// Create project card from issue
// https://developer.github.com/v3/projects/cards/#create-a-project-card
// https://octokit.github.io/rest.js/v17#projects-create-card
const { data: card } = octokit.projects.createCard({
column_id: colId,
content_id: github.context.event.issue.id,
content_type: 'Issue',
});

// Store resulting card ID (will be needed for `New PR to Project Column`)
const cardId = card.id;
}
 */
// When an issue is given the ‘review’ label, convert it to a pull request.
function issue2pr(octokit) {
    // Trigger: issue is given 'review' label
    // issue context
    // https://help.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
    // github.context.event is the webhook payload, in this case the issues event payload
    // https://developer.github.com/v3/activity/events/types/#issuesevent
    const issue = github.context.event.issue;
    const owner = issue.repository.owner.login;
    const repo = issue.repository.name;

    core.debug("woo printf debugging");

    // get reference
    // https://developer.github.com/v3/git/refs/#get-a-single-reference
    // https://octokit.github.io/rest.js/v17#git-get-ref
    var currentsha = 0;
    octokit.git.getRef({
        owner: owner,
        repo: repo,
        ref: 'heads/master'
    })
    .then(({
            data
        }) => {
        currentsha = data.object.sha;
    });

    // create branch
    // https://developer.github.com/v3/git/refs/#create-a-reference
    // https://octokit.github.io/rest.js/v17#git-create-ref
    var issueUser = issue.user.login;
    var issueNum = issue.number;
    var branchName = "request-" + issueUser + "-" + issueNum;
    octokit.git.createRef({
        owner: owner,
        repo: repo,
        ref: 'refs/heads/' + branchName,
        sha: currentsha
    })
    .then(({
            data
        }) => {
        // handle data
        core.debug(data);
    });

    // create file from issue body and commit it to the branch
    // https://developer.github.com/v3/repos/contents/#create-or-update-a-file
    // https://octokit.github.io/rest.js/v17#repos-create-or-update-file
    var filename = "grant-" + issueUser + "-" + issue.number + ".md";
    var path = "https://api.github.com/repos/nostarch-foundation/wip-grant-submissions/contents/grants/" + filename;
    var commitMessage = "Request #" + issue.number + " by " + issueUser;
    var fileContents = Buffer.from(issue.body).toString('base64');
    octokit.repos.createOrUpdateFile({
        owner: owner,
        repo: repo,
        path: path,
        message: commitMessage,
        content: fileContents,
        'committer.name': 'GitHub Action',
        'committer.email': 'action@github.com',
        'author.name': 'GitHub Action',
        'author.email': 'action@github.com'
    })
    .then(({
            data
        }) => {
        // handle data
        core.debug(data);
    });

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    var PRbody = "# Grant request for review. \n Submitted by " + issueUser + ", [original issue](" + issue.url + ")";
    var PRtitle = "[Review] Request by " + issueUser;
    octokit.pulls.create({
        owner: 'nostarch-foundation',
        repo: 'wip-grant-submissions',
        head: branchName,
        base: 'master',
        title: PRtitle,
        body: PRbody,
        maintainer_can_modify: true,
        draft: true
    })
    .then(({
            data
        }) => {
        // handle data
        core.debug(data);
    });
}

// When an issue is converted to a pull request, move the associated card to next column.
//function movePRcard(octokit) {
// Trigger: PullRequestEvent opened
// https://developer.github.com/v3/activity/events/types/#pullrequestevent

// Get project card ID
// Download card ID with actions/download-artifact in workflow and input to this action?

// Move a project card
// https://developer.github.com/v3/projects/cards/#move-a-project-card
// https://octokit.github.io/rest.js/v17#projects-move-card
//}

// most @actions toolkit packages have async methods
async function run() {
    try {
        console.log("am I here?");
        core.debug("where am I?");
        // This should be a token with access to your repository scoped in as a secret.
        // The YML workflow will need to set myToken with the GitHub Secret Token
        // myToken: ${{ secrets.GITHUB_TOKEN }}
        // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
        const myToken = core.getInput('myToken');

        // Authenticated Octokit client
        const octokit = new github.GitHub(myToken);

        const step = core.getInput('step')
            switch (step) {
                //			case "issue2project":
                //				issue2project(octokit);
                //				break;
            case "issue2pr":
                issue2pr(octokit);
                break;
                //			case "movePRcard":
                //				movePRcard(octokit);
                //				break;
            default:
                break;
            }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run()

/***/ }),

/***/ 431:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
const os = __webpack_require__(87);
/**
 * Commands
 *
 * Command Format:
 *   ##[name key=value;key=value]message
 *
 * Examples:
 *   ##[warning]This is the user warning message
 *   ##[set-secret name=mypassword]definitelyNotAPassword!
 */
function issueCommand(command, properties, message) {
    const cmd = new Command(command, properties, message);
    process.stdout.write(cmd.toString() + os.EOL);
}
exports.issueCommand = issueCommand;
function issue(name, message = '') {
    issueCommand(name, {}, message);
}
exports.issue = issue;
const CMD_STRING = '::';
class Command {
    constructor(command, properties, message) {
        if (!command) {
            command = 'missing.command';
        }
        this.command = command;
        this.properties = properties;
        this.message = message;
    }
    toString() {
        let cmdStr = CMD_STRING + this.command;
        if (this.properties && Object.keys(this.properties).length > 0) {
            cmdStr += ' ';
            for (const key in this.properties) {
                if (this.properties.hasOwnProperty(key)) {
                    const val = this.properties[key];
                    if (val) {
                        // safely append the val - avoid blowing up when attempting to
                        // call .replace() if message is not a string for some reason
                        cmdStr += `${key}=${escape(`${val || ''}`)},`;
                    }
                }
            }
        }
        cmdStr += CMD_STRING;
        // safely append the message - avoid blowing up when attempting to
        // call .replace() if message is not a string for some reason
        const message = `${this.message || ''}`;
        cmdStr += escapeData(message);
        return cmdStr;
    }
}
function escapeData(s) {
    return s.replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
function escape(s) {
    return s
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')
        .replace(/]/g, '%5D')
        .replace(/;/g, '%3B');
}
//# sourceMappingURL=command.js.map

/***/ }),

/***/ 470:
/***/ (function(__unusedmodule, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __webpack_require__(431);
const os = __webpack_require__(87);
const path = __webpack_require__(622);
/**
 * The code to exit an action
 */
var ExitCode;
(function (ExitCode) {
    /**
     * A code indicating that the action was successful
     */
    ExitCode[ExitCode["Success"] = 0] = "Success";
    /**
     * A code indicating that the action was a failure
     */
    ExitCode[ExitCode["Failure"] = 1] = "Failure";
})(ExitCode = exports.ExitCode || (exports.ExitCode = {}));
//-----------------------------------------------------------------------
// Variables
//-----------------------------------------------------------------------
/**
 * sets env variable for this action and future actions in the job
 * @param name the name of the variable to set
 * @param val the value of the variable
 */
function exportVariable(name, val) {
    process.env[name] = val;
    command_1.issueCommand('set-env', { name }, val);
}
exports.exportVariable = exportVariable;
/**
 * exports the variable and registers a secret which will get masked from logs
 * @param name the name of the variable to set
 * @param val value of the secret
 */
function exportSecret(name, val) {
    exportVariable(name, val);
    // the runner will error with not implemented
    // leaving the function but raising the error earlier
    command_1.issueCommand('set-secret', {}, val);
    throw new Error('Not implemented.');
}
exports.exportSecret = exportSecret;
/**
 * Prepends inputPath to the PATH (for this action and future actions)
 * @param inputPath
 */
function addPath(inputPath) {
    command_1.issueCommand('add-path', {}, inputPath);
    process.env['PATH'] = `${inputPath}${path.delimiter}${process.env['PATH']}`;
}
exports.addPath = addPath;
/**
 * Gets the value of an input.  The value is also trimmed.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   string
 */
function getInput(name, options) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
    if (options && options.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    return val.trim();
}
exports.getInput = getInput;
/**
 * Sets the value of an output.
 *
 * @param     name     name of the output to set
 * @param     value    value to store
 */
function setOutput(name, value) {
    command_1.issueCommand('set-output', { name }, value);
}
exports.setOutput = setOutput;
//-----------------------------------------------------------------------
// Results
//-----------------------------------------------------------------------
/**
 * Sets the action status to failed.
 * When the action exits it will be with an exit code of 1
 * @param message add error issue message
 */
function setFailed(message) {
    process.exitCode = ExitCode.Failure;
    error(message);
}
exports.setFailed = setFailed;
//-----------------------------------------------------------------------
// Logging Commands
//-----------------------------------------------------------------------
/**
 * Writes debug message to user log
 * @param message debug message
 */
function debug(message) {
    command_1.issueCommand('debug', {}, message);
}
exports.debug = debug;
/**
 * Adds an error issue
 * @param message error issue message
 */
function error(message) {
    command_1.issue('error', message);
}
exports.error = error;
/**
 * Adds an warning issue
 * @param message warning issue message
 */
function warning(message) {
    command_1.issue('warning', message);
}
exports.warning = warning;
/**
 * Writes info to log with console.log.
 * @param message info message
 */
function info(message) {
    process.stdout.write(message + os.EOL);
}
exports.info = info;
/**
 * Begin an output group.
 *
 * Output until the next `groupEnd` will be foldable in this group
 *
 * @param name The name of the output group
 */
function startGroup(name) {
    command_1.issue('group', name);
}
exports.startGroup = startGroup;
/**
 * End an output group.
 */
function endGroup() {
    command_1.issue('endgroup');
}
exports.endGroup = endGroup;
/**
 * Wrap an asynchronous function call in a group.
 *
 * Returns the same type as the function itself.
 *
 * @param name The name of the group
 * @param fn The function to wrap in the group
 */
function group(name, fn) {
    return __awaiter(this, void 0, void 0, function* () {
        startGroup(name);
        let result;
        try {
            result = yield fn();
        }
        finally {
            endGroup();
        }
        return result;
    });
}
exports.group = group;
//# sourceMappingURL=core.js.map

/***/ }),

/***/ 622:
/***/ (function(module) {

module.exports = require("path");

/***/ }),

/***/ 690:
/***/ (function() {

eval("require")("@actions/github");


/***/ })

/******/ });