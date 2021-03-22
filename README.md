# No Starch Press Foundation Grant Applications Automation Actions

This repository contains GitHub Actions to automate parts of the No Starch Press Foundations's
grant applications process. The action creates a project card for each issue that's created. When the issue is labelled "Review", the action commits the body of the issue to a file in the grants folder in a branch, converts the issue to a pull request for that branch, and moves the project card to another column on the project board. When the pull request is accepted, the issue file is committed to the main grants folder.

To use the action, you must provide the URL of the project board, and the column names from the project board, as shown in the sample workflow below.

## Sample Workflow
```name: "grant-application-workflow-actions"
on:
    issues:
        types: [opened, labeled]
    
jobs:
    grant-actions:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v1
            - name: add-project-card-for-issue
              uses: nostarch-foundation/grant-actions
              if: github.event_name == 'issues' && github.event.action == 'opened'
              with:
                myToken: ${{ secrets.GITHUB_TOKEN }}
                step: 'card-for-request'
                projectURL: 'https://github.com/nostarch-foundation/grant-actions/projects/1'
                requestColumn: 'Applications'
            - name: move-request-to-review
              uses: nostarch-foundation/grant-actions
              if: github.event_name == 'issues' && github.event.action == 'labeled' && github.event.label.name == 'Review'
              with:
                myToken: ${{ secrets.GITHUB_TOKEN }}
                step: 'request-to-review'
                projectURL: 'https://github.com/nostarch-foundation/grant-actions/projects/1'
                requestColumn: 'Applications'
                reviewColumn: 'To Review'
```

## Modification

1. Install nodejs.

2. Clone the repo and make your changes (code in index.js, inputs and conditions in .github/workflows/grant-actions.yml).

3. Run:
`npm test`

If it complains about eslint, run:
`npn install eslint`

Note: doesn't currently test action behaviour, just that it runs.

4. Run:
`npm run package`

Packaging copies index.js into dist/index.js, which is the file the action actually uses.

5. Commit and push the change.
