# Communication — MQTT session and message contract

**Agir Boat Monitoring · `src/services/`**  
_Last updated: 30/10/2026_

[JavaScript code](../README.md) · [State and validation](../core/README.md)

## Introduction

The browser communicates directly with the broker through MQTT over secure
WebSocket (`wss://`). This layer handles transport; measurement validity and
application conditions for commands are handled by `DashboardState`.

GitHub Pages serves the site files, but does not run this code on the server or
act as an MQTT intermediary. The `mqtt` library is loaded from a CDN in `index.html`.

## Structure

| Reference | Responsibility |
|---|---|
| [`mqtt-connection.js`](mqtt-connection.js) | `BrokerConnection` class: connection, subscriptions, publishing and diagnostics. |
| [`../config.js`](../config.js) | Public topic names and timeouts. |
| [`../core/state.js`](../core/state.js) | URL, measurement and command response validation. |
| [`../app.js`](../app.js) | Status callbacks, reception and user actions. |

## Connection lifecycle

| Step | Behaviour |
|---|---|
| `connect()` | Validates URL and credentials, closes the previous session and creates a new one. |
| `open()` | Generates an `agir_web_…` client ID, uses MQTT 3.1.1 and starts subscriptions after connection. |
| Subscriptions accepted | Sets `ready=true` and reports `connected` to the app. |
| Error, close or offline | Invalidates the current client, records the first cause for that attempt and retries after 5 s. |
| `disconnect()` | Cancels the next attempt, closes the client and releases credentials held by the service. |

Each reconnection uses a clean session and a new client ID. Events from clients
that have already been replaced are ignored. A rejected subscription prevents
the connection from being declared ready.

The URL must use WSS, without embedded credentials, query or fragment.
The connection timeout is 12 s. Address and credentials are separate parameters;
the current form is in [`index.html`](../../index.html).

## Topics: data from the boat

Full names are defined in `TOPICS`; they must stay consistent with
`communication_web/config/endpoints.yaml` in the Agir ROS repository.

| MQTT topic | Main content |
|---|---|
| `agir_gui/data/dashboard` | `header`, attitude, height, ultrasonic readings, battery, speed and their validity flags. |
| `agir_gui/data/map` | `header`, `gps_stamp`, `fix_valid`, `latitude_deg`, `longitude_deg`, `sog_mps`, `marks`. |
| `agir_gui/data/recording_state` | `recording`, `bag_name`, `last_error`. |

The corresponding ROS messages are `DashboardDataMsg`, `MapDataMsg` and
`RecordingState`. The gateway converts unavailable numbers to JSON `null`.
The [browser's field rules](../core/README.md#samples-and-validity) remain separate
from source validation performed by ROS.

A buoy in `marks` contains `type`, `lat`, `lon` and the header of the captured
sample. The browser uses type and coordinates to display it. Periodic state
preserves buoys even when the boat's current fix is invalid.

## Topics: requests and responses

| Action | Request | Response |
|---|---|---|
| Start | `agir_gui/cmd/start_recording` | `agir_gui/rsp/start_recording` |
| Stop | `agir_gui/cmd/stop_recording` | `agir_gui/rsp/stop_recording` |
| Ping | `agir_gui/cmd/ping_mark` | `agir_gui/rsp/ping_mark` |

Start and Stop send an object containing `requestId`. Ping adds `type`:

```json
{"requestId":"unique-identifier", "type":1}
```

`1` identifies Pin; Committee is `0` and Windward is `2`. **The browser sends no
coordinates:** the ROS system captures its own GPS fix when handling Ping.

| Response | Expected fields |
|---|---|
| Recording | `requestId`, `success`, `error_message`, `bag_name`. |
| Ping | `requestId`, `success`, `error_message`, `mark`; on success the buoy must match the requested type. |

Commands use QoS 1 and `retain=false`. An MQTT acknowledgment concerns transport,
not execution in ROS. The app waits for a response with the correct ID and uses
periodic updates to display recording state and buoys. It does not automatically
retry the command at application level after an unknown outcome.

## Accounts and permissions

| Account | Subscriptions requested by the client | Ping |
|---|---|---|
| `agir-staff` | Dashboard, map, recording, Start/Stop responses and Ping response. | Allowed if state and GPS are also valid. |
| Guest or unlisted username | Dashboard, map, recording and Start/Stop responses. | Rejected by the UI, state and `publish()` method. |

Permissions depend on the account of the ready MQTT session, not on later edits
to the form text. Recording currently does not have the same staff restriction
applied to Ping.

Configure ACLs on the broker: staff must be able to publish to `cmd/ping_mark`,
while guests must not. For other operations, assign read and publish access to
the topics required by the operational role. JavaScript checks do not replace ACLs.

The session keeps credentials in memory and does not save them in cookies or
browser storage. However, the distributed form contains prefilled values: any
credentials placed in public HTML can be read in the source.

## Discarded messages and errors

- Retained packets, packets larger than 65,536 bytes and unreadable JSON are ignored.
- Valid JSON that does not match the expected structure is then rejected or invalidated by application state.
- An error in the app callback is reported without printing the payload;
  it does not interrupt processing of subsequent messages.
- The library's QoS 0 queue and automatic resubscription are disabled;
  the app explicitly manages new sessions. QoS 1 may still produce transport
  duplicates: `requestId` identifies the same request.

`diagnostics()` exposes client ID, readiness, successful connections and the latest
failure: UTC date, event, a restricted code and a keepalive timeout indicator.
It records neither full error text nor credentials. To interpret delays together
with browser data, see [application diagnostics](../core/README.md#rendering-and-diagnostics).
