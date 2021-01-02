# No Starch Press Grant Applications Automation Actions

This repository contains GitHub Actions to automate parts of No Starch Press's
grant applications process.

## Setup

Install the dependencies  
```bash
$ npm install
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

## Development

The root of any GitHub Actions deployment is the `action.yml` file.
`action.yml` contains defines the inputs and output for your action. The
`index.js` file currently contains the bulk of relevant JavaScript code.

See the
[documentation](https://help.github.com/en/articles/metadata-syntax-for-github-actions).

Most toolkit and CI/CD operations involve async operations so the action is run
in an async function.

```javascript
const core = require('@actions/core');
...

async function run() {
  try { 
      ...
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
```

### Documentation

The majority of the documentation that exists for the Octokit Node.js library
can be found at https://octokit.github.io/rest.js/v17, in one very long
document (stylish, but annoying). For convenience, our code links in comments
directly to the doc for each API call made.

However, the Octokit docs aren't complete: they do not specify the format of
data returned by the API. To figure out the contents of API responses, the only
reference is the raw "dereferenced" API description, [found
here](https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/dereferenced/api.github.com.deref.yaml)
(warning: >10MB YAML document). It's ugly and meant for machines, not humans,
but it will at least tell you what you need to know, given some effort.

## Release

GitHub Actions will run the entry point from `action.yml`. Packaging assembles
the code into one file that can be checked in to Git, enabling fast and
reliable execution and preventing the need to check in `node_modules`.

Actions are run from GitHub repos. Packaging the action will create a packaged
action in the `dist/` folder.

Run package:

```bash
npm run package
```

GitHub Actions will run code checked in to the `dist/` folder, so push that
folder to GitHub to release:

```bash
git add dist
git commit
git push
```

## Testing

GitHub Actions run in a unique environment managed by GitHub, so there is no
easy way to run code locally. This limits testing severely, and forces us to
"test in prod". To see the result of an action, see the [actions
tab](https://github.com/actions/grant-actions/actions).

The [`act`](https://github.com/nektos/act) project offers a local lookalike
environment, though it doesn't yet have 100% feature parity, and may give
subtly different results. Nonetheless, this would be a huge improvement over
the current development workflow. If you do get act working in this project,
please leave instructions here!
