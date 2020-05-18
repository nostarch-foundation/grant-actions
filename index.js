const core = require('@actions/core');
const github = require('@actions/github');

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
if (projectID == 0) { console.log("No such project"); return; }

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
if (colID == 0) { console.log("No such column"); return; }

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
    // https://help.github.com/en/actions/building-actions/creating-a-javascript-action
    // github.context.payload is the webhook payload, in this case the issues event payload?
    // https://developer.github.com/v3/activity/events/types/#issuesevent

    //const context = JSON.stringify(github.context, undefined, 2);
    //console.log(`The context: ${context}`);
	//const repository = JSON.stringify(github.context.payload.repository, undefined, 2);
    //console.log(`The repository: ${repository}`);	
    const owner = github.context.payload.repository.owner.login;
    const repo = github.context.payload.repository.name;

    //console.log("woo printf debugging");

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
    var issueUser = github.context.payload.issue.user.login;
    var issueNum = github.context.payload.issue.number;
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
        console.log(data);
    });

    // create file from issue body and commit it to the branch
    // https://developer.github.com/v3/repos/contents/#create-or-update-a-file
    // https://octokit.github.io/rest.js/v17#repos-create-or-update-file
    var filename = "grant-" + issueUser + "-" + issueNum + ".md";
    var path = "https://api.github.com/repos/nostarch-foundation/wip-grant-submissions/contents/grants/" + filename;
    var commitMessage = "Request #" + issueNum + " by " + issueUser;
    var fileContents = Buffer.from(github.context.payload.issue.body).toString('base64');
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
        console.log(data);
    });

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    var PRbody = "# Grant request for review. \n Submitted by " + issueUser + ", [original issue](" + github.context.payload.issue.url + ")";
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
        console.log(data);
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