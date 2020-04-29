const core = require('@actions/core');
const github = require('@actions/github');

// When a new issue is opened, automatically add it to a GitHub project to facilitate review.
function issue2project(octokit) {
	// Create project card from issue 
	// https://developer.github.com/v3/projects/cards/#create-a-project-card
	
	// Store resulting card ID (will be needed for `New PR to Project Column`)
}

// When an issue is given the ‘review’ label, convert it to a pull request.
function issue2pr(octokit) {
    // get reference 
    // https://developer.github.com/v3/git/refs/#get-a-single-reference
    // https://octokit.github.io/rest.js/v17#git-get-ref
    const { data: master } = await octokit.git.getRef({
        owner: 'nostarch-foundation',
        repo: 'wip-grant-submissions',
        ref: 'heads/master'
      });

    //console.log(master);
    var currentsha = master.object.sha;

    // issue context
    // https://help.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
    // github.context.event is the webhook payload, in this case the issues event payload
    // https://developer.github.com/v3/activity/events/types/#issuesevent
    const issue = github.context.event.issue;	
    var issueUser = issue.user.login;
    var issueNum = issue.number;

    // create branch
    // https://developer.github.com/v3/git/refs/#create-a-reference
    // https://octokit.github.io/rest.js/v17#git-create-ref
    var branchName = "request-"+issueUser+"-"+issueNum;	
    const { data: branch} = await octokit.git.createRef({
        owner: 'nostarch-foundation',
        repo: 'wip-grant-submissions',
        ref: 'refs/heads/'+branchName,
        sha: currentsha
      });

    console.log(branch)

    // create file from issue body and commit it to the branch
    // https://developer.github.com/v3/repos/contents/#create-or-update-a-file
    // https://octokit.github.io/rest.js/v17#repos-create-or-update-file
    var filename = "grant-"+issueUser+"-"+issue.number+".md";
    var path = "https://api.github.com/repos/nostarch-foundation/wip-grant-submissions/contents/grants/" + filename;
    var commitMessage = "Request #"+issue.number+" by "+issueUser;
    var fileContents = Buffer.from(issue.body).toString('base64');	
    const {data: ret} = await octokit.repos.createOrUpdateFile({
        owner: 'nostarch-foundation',
        repo: 'wip-grant-submissions',
        path: path,
        message: commitMessage,
        content: fileContents,
        'committer.name': 'GitHub Action',
        'committer.email': 'action@github.com',
        'author.name': 'GitHub Action',
        'author.email': 'action@github.com'
      });

    console.log(ret);

    // create pull request for the branch
    // https://developer.github.com/v3/pulls/#create-a-pull-request
    // https://octokit.github.io/rest.js/v17#pulls-create
    var PRbody = "# Grant request for review. \n Submitted by "+issueUser+", [original issue]("+issue.url+")";
    var PRtitle = "[Review] Request by "+issueUser;
    const { data: pullRequest } = await octokit.pulls.create({
          owner: 'nostarch-foundation',
          repo: 'wip-grant-submissions',
        head: branchName,
        base: 'master',
        title: PRtitle,
        body: PRbody,
        maintainer_can_modify: true,
        draft: true
    });

    console.log(pullRequest);

}

// When an issue is converted to a pull request, move the associated card to next column.
function pr2project(octokit) {
	// PullRequestEvent opened
	// https://developer.github.com/v3/activity/events/types/#pullrequestevent
	
	// Get project card ID
	
	// Move a project card
	// https://developer.github.com/v3/projects/cards/#move-a-project-card
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
	
		const workflow = core.getInput('workflow')
		switch (workflow) {
			case "issue2project":
				issue2project(octokit);
				break;
			case "issue2pr":
				issue2pr(octokit);
				break;
			case "pr2project": 
				pr2project(octokit);
				break;
			default:
				break;
		}
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
