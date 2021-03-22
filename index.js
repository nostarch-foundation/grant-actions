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
async function getColumnIDByName(octokit, inputColumnName) {
    const columnName = core.getInput(inputColumnName);
    var projectID = await getProjectID(octokit);
    if (projectID == 0) {
        throw "Project not found.";
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
    var colID = await getColumnIDByName(octokit, 'requestColumn');
    if (colID == 0) {
        throw "Column not found.";
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

// When an issue is given the 'Review' label, hide the issue card and add a PR
// card to the 'Review' column. Note that the ID of a PR is not the same as its
// number; the ID is a random number which must be retrieved using the GH API.
async function replaceIssueCardWithPRCard(octokit, prID){
    console.log("replaceIssueCardWithPRCard");
    // Find ID of column the card is currently in, using requestColumn action input.
    var colID = await getColumnIDByName(octokit, 'requestColumn');
    if (colID == 0) {
        throw "Column not found.";
    }
    
    // List cards in that column.
    // https://octokit.github.io/rest.js/v17#projects-list-cards
    // TODO only gets first page, paginate to get more than 30 cards
    console.log("Cards list for column 'requestColumn'");
    var resp = await octokit.projects.listCards({
        column_id: colID,
        archived_state: 'not_archived',
    });
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
        console.log("Card for issue " + github.context.payload.issue.url + " not found.");
        console.log("Assuming it has already been archived. Continuing...");
    } else {
        // https://octokit.github.io/rest.js/v17#projects-update-card
        resp = await octokit.projects.updateCard({
            card_id: cardID,
            archived: true  // Archive the old card.
        });
        console.log("Archived card " + github.context.payload.issue.url);
        console.log(resp.status);
    }
    
    // Create a new card to replace the old one.
    // Find ID of column to put card in.
    var reviewColID = await getColumnIDByName(octokit, 'reviewColumn');
    if (reviewColID == 0) {
        throw "Column 'reviewColumn' not found.";
    }
    console.log("Creating card for PR with ID " + prID);
    resp = await octokit.projects.createCard({
        column_id: reviewColID,
        content_id: prID,
        content_type: "PullRequest"
    })
    console.log("Created card for PR " + prID);
    console.log(resp);
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
    console.log(resp);
    var currentsha = resp.data.object.sha;
    //console.log(currentsha);

    // create branch
    // https://developer.github.com/v3/git/refs/#create-a-reference
    // https://octokit.github.io/rest.js/v17#git-create-ref
    var issueUser = github.context.payload.issue.user.login;
    var issueNum = github.context.payload.issue.number;
    var branchName = "request-" + issueUser + "-" + issueNum;
    var req = {
        owner: owner,
        repo: repo,
        ref: 'refs/heads/' + branchName,
        sha: currentsha
    };
    console.log('Creating branch:');
    console.log(req);
    try {
        resp = await octokit.git.createRef(req);
        console.log(resp.status);
    } catch(e) {
        console.log("caught exception: " + e);
        console.log(e);
        if (!e.message.includes("already exists")) {
            console.log("rethrowing...");
            throw e;
        }
        // Branch already exists. Continue.
        console.log("continuing...");
    }

    // create file from issue body and commit it to the branch
    // https://developer.github.com/v3/repos/contents/#create-or-update-a-file
    // https://octokit.github.io/rest.js/v17#repos-create-or-update-file
    var filename = "grant-" + issueUser + "-" + issueNum + ".md";
    var path = "grants/" + filename;
    // Check for existence of the file we're about to try to write, note what
    // GH thinks its current SHA1 hash is. The way that GitHub computes file
    // SHA1 hashes is mysterious and idiosyncratic; I (ericdand) have been
    // unable to get a matching hash from the original data no matter how I
    // encode or pad the data. Just use whatever GH thinks the hash is.
    var sha = '';
    console.log('checking for file ' + path);
    try {
        var fileInfo = await octokit.request(
            'GET /repos/{owner}/{repo}/contents/{path}?ref={branch}', {
                owner: owner,
                repo: repo,
                path: path,
                branch: branchName
        });
        console.log("found file:");
        console.log(fileInfo);
        sha = fileInfo.data.sha;
    } catch (e) {
        if (!e.status == 404) {
            console.log('caught exception: ' + e);
            console.log(e);
            console.log('rethrowing...');
            throw e
        }
        console.log('file not found; this is expected');
    }

    var commitMessage = "Request #" + issueNum + " by " + issueUser;
    var fileContents = Buffer.from(github.context.payload.issue.body);
    console.log("creating file from issue #" + issueNum);
    req = {
        owner: owner,
        repo: repo,
        branch: branchName,
        path: path,
        message: commitMessage,
        content: fileContents.toString('base64'),
        'committer.name': 'GitHub Action',
        'committer.email': 'action@github.com',
        'author.name': 'GitHub Action',
        'author.email': 'action@github.com'
    };
    if (sha != '') {
        req.sha = sha;
    }
    console.log('CreateOrUpdateFile:');
    console.log(req);
    try {
        resp = await octokit.repos.createOrUpdateFile(req);
    } catch (e) {
        console.log('saw exception: ' + e);
        console.log(e);
        console.log('rethrowing...');
        throw e;
    }
    console.log(resp.status);

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    var PRbody = "# Grant request for review. \nSubmitted by " + issueUser + ", [original issue](" + github.context.payload.issue.url + "), resolves #" + issueNum;
    req = {
        owner: owner,
        repo: repo,
        head: branchName,
        base: 'master',
        title: "[Review] Request by " + issueUser,
        maintainer_can_modify: true,
        draft: false,
        body: PRbody
    };
    console.log('Creating pull: ');
    console.log(req);
    var prID = -1;
    try {
        resp = await octokit.pulls.create(req);
        console.log(resp);
        console.log(resp.status);
        prID = resp.data.id;
    } catch (e) {
        console.log('saw exception: ' + e);
        if (!e.message.includes('A pull request already exists')) {
            console.log(e);
            console.log('rethrowing...');
            throw e;
        }
        console.log('finding ID of already-existing pull request.');
        console.log('listing pull requests...');
        resp = await octokit.pulls.list({
            owner: owner,
            repo: repo,
            sort: 'updated', // TODO(ericdand): paginate.
            direction: 'desc'
        });
        for (const pull of resp.data) {
            if (pull.body.includes('resolves #' + issueNum)) {
                console.log('found pull request #' + pull.number);
                prID = pull.id;
                break;
            }
        }
        if (prID < 0) {
            throw 'pull request ID not found';
        }
        console.log('continuing...');
    }

    await replaceIssueCardWithPRCard(octokit, prID); 
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
            break;
        default:
            break;
        }
    } catch (error) {
        core.setFailed(error);
    }
}

run()
