const core = require('@actions/core');
const github = require('@actions/github');

// When a new issue is opened, automatically add it to a GitHub project to facilitate review.
async function issueCard(octokit) {
    // Trigger: issue opened
    // issue context
    // https://help.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
    // github.context.event is the webhook payload, in this case the issues event payload
    // https://developer.github.com/v3/activity/events/types/#issuesevent
    const owner = github.context.payload.repository.owner.login;
    const repo = github.context.payload.repository.name;

    // Cribbing from github-actions-automate-projects
    // https://github.com/takanabe/github-actions-automate-projects/blob/master/main.go

    // Find project ID
    // https://octokit.github.io/rest.js/v17#projects-list-for-repo
    // https://developer.github.com/v3/projects/
	// TODO works for <=30 projects, only gets first page of projects
    var resp = await octokit.projects.listForRepo({
		owner: owner,
        repo: repo,
    });
	
    const projectURL = core.getInput('projectURL');
	var projectID = 0;
	for (const project of resp.data) {
		if (project.html_url == projectURL) {
			projectID = project.id;
			break;
		}
	}
	if (projectID == 0) {
		console.log("Project not found."); // TODO error handling
		return;
	}

    // Find column ID
    // https://octokit.github.io/rest.js/v17#projects-list-columns
    // https://developer.github.com/v3/projects/columns/#list-project-columns
	// TODO works for <=30 project columns, only gets first page
    resp = await octokit.projects.listColumns({
            project_id: projectID,
    });

    const colName = core.getInput('columnName');
	var colID = 0;
	for (const column of resp.data) {
		if (column.name == colName) {
			colID = column.id;
			break;
		}
	}
	if (colID == 0) {
		console.log("Column not found."); // TODO error handling
		return;
	}

    // Create project card from issue
    // https://developer.github.com/v3/projects/cards/#create-a-project-card
    // https://octokit.github.io/rest.js/v17#projects-create-card
    resp = await octokit.projects.createCard({
        column_id: colID,
        content_id: github.context.payload.issue.id,
        content_type: 'Issue',
    });
	console.log(resp); // TODO proper check

    // Store resulting card ID (will be needed for `New PR to Project Column`)
    //const cardId = resp.data.id;
}

// When an issue is given the ‘review’ label, convert it to a pull request.
async function issue2pr(octokit) {
    // Trigger: issue is given 'review' label
    // issue context
    // https://help.github.com/en/actions/building-actions/creating-a-javascript-action
    // github.context.payload is the webhook payload, in this case the issues event payload?
    // https://developer.github.com/v3/activity/events/types/#issuesevent

    const owner = github.context.payload.repository.owner.login;
    const repo = github.context.payload.repository.name;
    // get reference
    // https://developer.github.com/v3/git/refs/#get-a-single-reference
    // https://octokit.github.io/rest.js/v17#git-get-ref
    var resp = await octokit.git.getRef({
        owner: owner,
        repo: repo,
        ref: 'heads/master'
    });
    //console.log(resp);
    var currentsha = resp.data.object.sha;
    console.log(currentsha);

    // create branch
    // https://developer.github.com/v3/git/refs/#create-a-reference
    // https://octokit.github.io/rest.js/v17#git-create-ref
    var issueUser = github.context.payload.issue.user.login;
    var issueNum = github.context.payload.issue.number;
    var branchName = "request-" + issueUser + "-" + issueNum;
    resp = await octokit.git.createRef({
        owner: owner,
        repo: repo,
        ref: 'refs/heads/' + branchName,
        sha: currentsha
    });
    console.log(resp); // TODO proper success check (status == 201)

    // create file from issue body and commit it to the branch
    // https://developer.github.com/v3/repos/contents/#create-or-update-a-file
    // https://octokit.github.io/rest.js/v17#repos-create-or-update-file
    var filename = "grant-" + issueUser + "-" + issueNum + ".md";
    var path = "grants/" + filename;
    var commitMessage = "Request #" + issueNum + " by " + issueUser;
    var fileContents = Buffer.from(github.context.payload.issue.body).toString('base64');
    resp = await octokit.repos.createOrUpdateFile({
        owner: owner,
        repo: repo,
        branch: branchName,
        path: path,
        message: commitMessage,
        content: fileContents,
        'committer.name': 'GitHub Action',
        'committer.email': 'action@github.com',
        'author.name': 'GitHub Action',
        'author.email': 'action@github.com'
    });
    console.log(resp); // TODO proper success check

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    var PRbody = "# Grant request for review. \n Submitted by " + issueUser + ", [original issue](" + github.context.payload.issue.url + ")";
    var PRtitle = "[Review] Request by " + issueUser;
    resp = await octokit.pulls.create({
        owner: owner,
        repo: repo,
        head: owner + ":" + branchName,
        base: 'master',
        title: PRtitle,
        body: PRbody,
        maintainer_can_modify: true,
        draft: false
    });
    console.log(resp); // TODO proper success check
}

// When an issue is converted to a pull request, move the associated card to next column.
//function moveIssuecard(octokit) {
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
        //console.log("am I here?");
        // This should be a token with access to your repository scoped in as a secret.
        // The YML workflow will need to set myToken with the GitHub Secret Token
        // myToken: ${{ secrets.GITHUB_TOKEN }}
        // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
        const myToken = core.getInput('myToken');

        // Authenticated Octokit client
        const octokit = new github.GitHub(myToken);

        const step = core.getInput('step')
            switch (step) {
            case "issuecard":
                await issueCard(octokit);
                break;
            case "issue2pr":
                await issue2pr(octokit);
                break;
                //			case "moveIssuecard":
                //				await moveIssueCard(octokit);
                //				break;
            default:
                break;
            }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run()
