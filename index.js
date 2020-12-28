const core = require('@actions/core');
const github = require('@actions/github');

// Returns the ID of the project specified by the projectURL action parameter.
// If no such project exists, returns 0.
async function getProjectID(octokit) {
	// Find project ID
    // https://octokit.github.io/rest.js/v17#projects-list-for-repo
    // https://developer.github.com/v3/projects/
	// TODO works for <=30 projects, only gets first page of projects

	var resp = await octokit.projects.listForRepo({
		owner: github.context.payload.repository.owner.login,
        repo: github.context.payload.repository.name,
    });
	
    const projectURL = core.getInput('projectURL');
	for (const project of resp.data) {
		if (project.html_url == projectURL) {
			return project.id;
		}
	}
	return 0;
}

// Returns the ID of the column specified by the columnName,
// in the project specified by the projectURL action input.
// If no such column exists, returns 0.
async function getColumnID(octokit, columnName) {
	var projectID = await getProjectID(octokit);
	if (projectID == 0) {
		console.log("Project not found."); // TODO error handling
		return;
	}	
	
    // https://octokit.github.io/rest.js/v17#projects-list-columns
    // https://developer.github.com/v3/projects/columns/#list-project-columns
	// TODO works for <=30 project columns, only gets first page	
    var resp = await octokit.projects.listColumns({
            project_id: projectID,
    });

	for (const column of resp.data) {
		if (column.name == columnName) {
			return column.id;
		}
	}
	return 0;
}

// When a new issue is opened, automatically add it to a GitHub project to facilitate review.
async function createIssueCard(octokit) {
	console.log("createIssueCard");
    // Trigger: issue opened
    // issue context
    // https://help.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
    // github.context.event is the webhook payload, in this case the issues event payload
    // https://developer.github.com/v3/activity/events/types/#issuesevent

    // Cribbing from github-actions-automate-projects
    // https://github.com/takanabe/github-actions-automate-projects/blob/master/main.go

    // Find ID of column to put card in, using projectURL and requestColumn action inputs.	
	const colName = core.getInput('requestColumn');
	var colID = await getColumnID(octokit, colName);
	if (colID == 0) {
		console.log("Column not found."); // TODO error handling
		return;
	}

    // Create project card from issue
    // https://developer.github.com/v3/projects/cards/#create-a-project-card
    // https://octokit.github.io/rest.js/v17#projects-create-card
    var resp = await octokit.projects.createCard({
        column_id: colID,
        content_id: github.context.payload.issue.id,
        content_type: 'Issue',
    });
	console.log(resp.status); // TODO proper check
	// resp.data.content_url == url of associated issue
    // e.g. content_url: 'https://api.github.com/repos/nostarch-foundation/grant-actions/issues/8'
}

// When an issue is given the 'Review' label, move the issue project card to the 'Review' column.
async function moveIssueCard(octokit){
	console.log("moveIssueCard");
	// Find ID of column the card is currently in, using requestColumn action input.
	const requestCol = core.getInput('requestColumn');
	var colID = await getColumnID(octokit, requestCol);
	if (colID == 0) {
		console.log("Column not found."); // TODO error handling
		return;
	}
	
	// List cards in that column.
	// https://octokit.github.io/rest.js/v17#projects-list-cards
	// TODO only gets first page, paginate to get more than 30 cards
	var resp = await octokit.projects.listCards({
		column_id: colID,
		archived_state: 'not_archived',
	});
	console.log("Cards list");
	console.log(resp.status);
	
	// Get ID of card to move, by matching issue URLs.
	// https://developer.github.com/v3/projects/cards/#get-a-project-card
	// resp.data.[].content_url is the URL of the issue associated with the card
	// e.g. 'https://api.github.com/repos/nostarch-foundation/grant-actions/issues/8'
	// github.context.payload.url is same URL from webhook payload on issue event
	var cardID = 0;
	for (const card of resp.data) {
		if (card.content_url == github.context.payload.issue.url) {
			cardID = card.id;
			break;
		}
	}
	if (cardID == 0) {
		console.log("Card not found.");
		return; // TODO error handling
	}
	
    // Find ID of column to put card in.
	const reviewCol = core.getInput('reviewColumn');
	colID = await getColumnID(octokit, reviewCol);
	if (colID == 0) {
		console.log("Column not found."); // TODO error handling
		return;
	}
    
	// https://octokit.github.io/rest.js/v17#projects-move-card
    resp = await octokit.projects.moveCard({
		card_id: cardID,
		position: "top",
		column_id: colID,
	});
	console.log("Moved card");
	console.log(resp.status);
}

// When an issue is given the ‘review’ label, convert it to a pull request.
async function issue2pr(octokit) {
    // Trigger: issue is given 'review' label
    // issue context
    // https://help.github.com/en/actions/building-actions/creating-a-javascript-action
    // github.context.payload is the webhook payload, in this case the issues event payload?
    // https://developer.github.com/v3/activity/events/types/#issuesevent
	console.log("issue2pr");

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
    //console.log(currentsha);

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
    console.log(resp.status); // TODO proper success check (status == 201)

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
    console.log(resp.status); // TODO proper success check

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    //var PRbody = "# Grant request for review. \n Submitted by " + issueUser + ", [original issue](" + github.context.payload.issue.url + "), resolves #" + issueNum;
    //var PRtitle = "[Review] Request by " + issueUser;
    resp = await octokit.pulls.create({
        owner: owner,
        repo: repo,
		issue: issueNum,
        head: branchName,
        base: 'master',
        //title: PRtitle,
        maintainer_can_modify: true,
        draft: true
    });
    console.log(resp.status); // TODO proper success check
}

// most @actions toolkit packages have async methods
async function run() {
    try {
        // This should be a token with access to your repository scoped in as a secret.
        // The YML workflow will need to set myToken with the GitHub Secret Token
        // myToken: ${{ secrets.GITHUB_TOKEN }}
        // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
        const myToken = core.getInput('myToken');

        // Authenticated Octokit client
        const octokit = new github.GitHub(myToken);

        const step = core.getInput('step')
        switch (step) {
        case "card-for-request":
            await createIssueCard(octokit);
            break;
        case "request-to-review":
            await issue2pr(octokit);
			await moveIssueCard(octokit);
            break;
        default:
            break;
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run()
