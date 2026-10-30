# Deployment — GitHub Pages

**Agir Boat Monitoring · `.github/`**  
_Last updated: 30/10/2026_

[Project overview](../README.md) · [Tests before deployment](../test/README.md)

## Introduction

This folder contains the automation that publishes the web app to GitHub Pages.
The workflow deploys static files: it does not start a backend, compile JavaScript
or change ROS nodes or the broker.

## Structure

| Path | Purpose |
|---|---|
| [`workflows/pages.yml`](workflows/pages.yml) | `Deploy to GitHub Pages` workflow. |

## When it runs

| Event | Effect |
|---|---|
| Push to the `main` branch | Starts deployment of the updated content. |
| Manual workflow run | Uses the `workflow_dispatch` event defined in the file. |

The concurrency group is `pages` and `cancel-in-progress` is `false`: an ongoing
deployment is not interrupted by the next one. The job uses an `ubuntu-latest`
runner and the `github-pages` environment.

## Deployment steps

1. **Checkout:** retrieves the repository files.
2. **Setup Pages:** prepares the deployment context.
3. **Upload artifact:** prepares the artifact from `path: '.'`, meaning the root.
4. **Deploy:** publishes the artifact and associates the returned URL with the environment.

| Workflow permission | Use |
|---|---|
| `contents: read` | Reading repository content. |
| `pages: write` | Publishing the site. |
| `id-token: write` | Identifying the job to the deployment service. |

The current workflow contains no npm installation, build or test execution.
The repository's Pages configuration must allow deployment through GitHub Actions.

## Files required on the site

| Element | Why it is needed |
|---|---|
| `index.html` in the root | Site entry point and shared document. |
| `src/` | JavaScript modules loaded by the browser. |
| `pages/` | Fragments fetched with `fetch()` at startup. |
| `assets/` | Local CSS and logos. |
| `.nojekyll` | Makes static deployment without Jekyll processing explicit. |

Do not move only `index.html`: the page depends on the other folders' relative
paths. A Pages project's URL prefix requires no import changes;
the [asset test](../test/assets.test.js) checks this case.

The workflow starts from the entire root: do not treat committed files as private
storage. ROS credentials, confidential data and local broker configurations must
not enter the public artifact. GitHub Secrets does not keep a value secret if it
is subsequently inserted into distributed HTML or JavaScript.

## Update procedure

1. Run the [automated tests and view checks](../test/README.md).
2. Check that the commit includes the necessary new files, moves and removals.
3. Push the commit to `main` and follow the workflow through to completion.
4. Open the deployment URL and check login, demo, navigation and map loading.

Changing files on the PC does not update the site by itself. If you also change
the message contract, deploy compatible ROS software separately:
this pipeline updates only the web app.
