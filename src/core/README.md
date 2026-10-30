# Shared logic — State, permissions and diagnostics

**Agir Boat Monitoring · `src/core/`**  
_Last updated: 30/10/2026_

[JavaScript code](../README.md) · [Project overview](../../README.md)

## Introduction

These modules decide which data can be used and which actions are allowed.
They neither open MQTT connections nor modify the DOM. They can therefore be tested
with simulated data and a controlled clock, without a browser or boat.

## Structure

| File | Main elements | Responsibility |
|---|---|---|
| [`state.js`](state.js) | `DashboardState`, `finite()`, `brokerUrl()` | Samples, expiry, requests and values ready for the UI. |
| [`marks.js`](marks.js) | `MARK_NAMES`, `validMark()`, `validMarks()` | Buoy codes and validation. |
| [`permissions.js`](permissions.js) | `isStaff()` | Identifying accounts allowed to Ping. |
| [`live-runtime.js`](live-runtime.js) | `createRenderScheduler()`, `LiveDiagnostics` | Coalesced renders and diagnostic counters. |

Time limits and the staff list are in [`config.js`](../config.js).

## Samples and validity

`ingest(topic, data)` stores the latest sample from each stream and its reception
time, measured with `performance.now()`. It returns `false` when the topic or
minimum structure is not recognized.

| Stream | Minimum accepted structure | Browser expiry |
|---|---|---:|
| Dashboard | Boolean `attitude_valid`, `height_valid`, `battery_valid`, `sog_valid`. | 3 s |
| Map | Boolean `fix_valid`. | 3 s |
| Recording | Boolean `recording`; string `bag_name` and `last_error`. | 5 s |

`values()` then applies flags and checks to individual fields. Accepting a message
does not mean that all its measurements are valid.

| Received fields | Display validation |
|---|---|
| `roll_deg`, `pitch_deg`, `yaw_deg` | `attitude_valid` is true and the value is a finite number. |
| `height_m` | `height_valid` is true and the value is finite; negative values are allowed. |
| `sog_mps` | `sog_valid` is true and the value is finite. |
| `ultrasonic_left_m`, `ultrasonic_right_m` | The corresponding side's flag is true and the value is finite and non-negative. |
| `battery_low` | `battery_valid` is true and the value is boolean. |
| `battery_voltage_v` | `battery_valid` is true and the value is finite; the field may be absent in older gateways. |
| `latitude_deg`, `longitude_deg` | `fix_valid` is true, values are finite, latitude is within ±90 and longitude within ±180. |

Unavailable values become `null`, which renderers display as `—` or `Unknown`.
An invalid ultrasonic reading does not invalidate the other side. Battery voltage
and alarm may also be available independently.

**Two freshness checks:** the browser measures time since MQTT reception;
the ROS gateway checks sources and produces the flags. `header.stamp` is displayed
and used for diagnostics, but it is not the expiry criterion used by `fresh()`.

## Recording and Ping: separate requests

| Operation | Before sending | On response or expiry |
|---|---|---|
| `begin(action, requestId)` | Session ready, recent recording state, action consistent with Idle/Recording, no pending recording request. | `response()` requires the correct topic and ID; it then clears recording state to wait for a subsequent update. |
| `beginPing(type, requestId)` | Staff, session ready, valid fix, valid `marks` array and no pending Ping. | `pingResponse()` checks the ID and, on success, the buoy type and coordinates. It does not insert the marker. |
| `expire()` / `expirePing()` | Checks elapsed waiting time against 22 s. | Releases the request; a timeout does not prove that ROS rejected the command. |

`pending` and `pingPending` are independent: a Ping does not occupy the slot for
a recording command. After disconnection, `reset()` clears samples, requests and
local permissions; subsequent messages must rebuild the state.

## Buoy types and permissions

| Code | UI name | Meaning |
|---:|---|---|
| 0 | Committee | Committee |
| 1 | Pin | Pin |
| 2 | Windward | Windward |

`validMark()` checks type and coordinates. `validMarks()` accepts zero to three
buoys, all valid and with no duplicate types. An empty array is valid; a missing
`marks` field is not, and prevents Ping to an incompatible onboard version.

`canDraw()` enables Draw when `marks()` contains both Committee (`0`) and Pin
(`1`). It requires neither staff permissions nor a current boat fix: it uses the
buoys saved in recent map state. If that state expires, is cleared or loses either
buoy, Draw becomes disabled again.

`isStaff()` trims whitespace around the username and compares it with
`STAFF_USERNAMES`, respecting case. It currently recognizes `agir-staff`.
This rule applies to Ping; actual topic access also requires
[broker permissions](../services/README.md#accounts-and-permissions).

## Rendering and diagnostics

The scheduler keeps a single pending frame. Command responses are handled
immediately; the UI updates at the available frame using the latest state.
A renderer error is reported to `onError` without blocking all future renders.

To investigate a delay, open the browser console and run:

```js
JSON.stringify(window.agirDiagnostics(), null, 2)
```

| Field | Interpretation |
|---|---|
| `snapshotAgeAtReceiveMs` | Browser time minus dashboard timestamp. Includes the PC/Pi clock offset. |
| `addedAgeSinceBestMs` | Increase over the lowest observed age; useful if the clock offset stays stable. |
| `sinceLastReceiveMs` / `lastReceiveGapMs` | Current silence and gap between the latest dashboard messages. |
| `messagesSinceLastPaint` | Dashboard messages received but not yet rendered. |
| `lastPaintMs` / `maxPaintMs` | JavaScript render time, not the browser's subsequent graphical work. |
| `lastEventLoopLagMs` / `maxEventLoopLagMs` | Additional timer delay beyond the expected 250 ms. |
| `renderErrors` | Caught rendering errors. |
| `ultrasonicLeftValid` / `ultrasonicRightValid` | Latest received flags; `false` may already originate from the gateway. |
| `mqtt`, `trackPoints`, `visibility` | Connection metadata, points in memory and tab visibility, added by `app.js`. |

Compare these values at session start and when the problem occurs, keeping the
tab in the foreground. Increasing age alone does not establish that the broker
causes the delay: also compare ROS data and an independent MQTT client.
The counters store no payloads or passwords; reloading the page resets them.

## Related checks

State, buoy, permission and runtime tests are in [`test/`](../../test/README.md).
When changing a rule, also check missing data, expiry and reconnection, not only
the path where all sensors are valid.
