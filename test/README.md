# Tests — Automated checks and interface testing

**Agir Boat Monitoring · `test/`**  
_Last updated: 30/10/2026_

[Project overview](../README.md) · [Deployment](../.github/README.md)

## Introduction

The suite checks app logic with the test runner built into Node.js. It uses
simulated MQTT clients, clocks, frames and Leaflet objects: **it does not contact
the broker, start ROS or send commands to the boat**.

Node.js is needed for these development checks, not to run the published site.
The repository declares no npm dependencies to install for the current suite.

## Structure

| File | What it checks |
|---|---|
| [`assets.test.js`](assets.test.js) | HTML/CSS/import paths under a GitHub Pages prefix and correct filename case. |
| [`pages.test.js`](pages.test.js) | View loading, unique IDs, a failed view and navigation. |
| [`state.test.js`](state.test.js) | Measurement validity and expiry, recording conditions, responses and broker URL. |
| [`connection.test.js`](connection.test.js) | Subscriptions, publishing, replaced sessions, errors and client permissions. |
| [`permissions.test.js`](permissions.test.js) | Staff allowlist and rejection of viewer Pings. |
| [`marks.test.js`](marks.test.js) | Buoy codes, validation, Ping requests, Draw / Clear line, preservation of buoys and track, and marker updates. |
| [`map.test.js`](map.test.js) | GPS direction, track, Follow, gaps and Reset track. |
| [`live-runtime.test.js`](live-runtime.test.js) | Render coalescing, error recovery and delay diagnostics. |

## Running tests

Open a terminal in the `agir_boat_monitoring` folder and run:

```bash
npm test
```

The command defined in [`package.json`](../package.json) is equivalent to:

```bash
node --test test/*.test.js
```

To work on one component, you can run a single file, for example:

```bash
node --test test/map.test.js
```

A valid result has zero failed tests and exit code zero. If the runner does not
start, first check `node --version` and the current folder. The command requires
neither an open MQTT session nor a file containing the boat's credentials.
