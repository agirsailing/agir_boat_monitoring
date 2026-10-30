# HTML views — Dashboard and Map

**Agir Boat Monitoring · `pages/`**  
_Last updated: 30/10/2026_

[Project overview](../README.md) · [Interface logic](../src/ui/README.md)

## Introduction

This folder contains the content of the two views. The files are **HTML fragments**:
they include no `<head>`, libraries or second MQTT connection. They are loaded
into `#page-content` in [`index.html`](../index.html), which contains login, navbar and footer.

To use the app, open the site and choose `#dashboard` or `#map`.
Opening `pages/map.html` directly does not launch a working standalone page.

## Structure

| File | Main container | Responsibility |
|---|---|---|
| [`dashboard.html`](dashboard.html) | `dashboard-page` | Instruments, recording and disconnection. |
| [`map.html`](map.html) | `map-page` | Map, track, buoys and navigation controls. |

View loading and selection are defined in
[`src/ui/pages.js`](../src/ui/pages.js); renderer details are in the
[`ui/` README](../src/ui/README.md).

## Dashboard: reading measurements

| Card | Unit | Interpretation |
|---|---|---|
| Speed over ground | m/s | GPS speed over ground, not knots. |
| Estimated height | m | Estimated vertical height relative to the flotation reference; may be negative. |
| Left / Right ultrasonic | m | Distances measured along the two sensor beams, not corrected height. |
| Roll / Pitch / Yaw | Degrees | Aerospace convention: right side down, bow up and right turn are positive. |
| Position | Decimal degrees | Latitude and longitude; GPS speed is also shown in m/s. |
| Battery | V and alarm | Voltage and low battery signal; not charge percentage. |
| Telemetry timestamp | ISO in UTC | Telemetry snapshot timestamp, not the time of the latest render. |

## Recording and connection

| Control | When available | Result |
|---|---|---|
| Start recording | Connection ready, recent `Idle` state, no pending recording command. | Requests rosbag recording on the Raspberry. |
| Stop | Connection ready, recent `Recording` state, no pending recording command. | Requests recording shutdown. |
| Disconnect | A connection or connection attempt exists. | Closes the MQTT session and cancels reconnection attempts. |

Start and Stop are disabled in demo mode. The bag name and state come from ROS:
a successful command response does not replace the subsequent state message.
After a timeout, check the state before trying again.

## Map: position, track and buoys

| Control | Current use |
|---|---|
| Follow boat | Centres the view on the boat. Dragging the map disables it; the button re-enables it. |
| Reset track | Clears the track and starts from the current fix; if unavailable, waits for the next valid one. Does not clear buoys. |
| Buoy type | Selects Pin, Committee or Windward; does not create a buoy by itself. |
| Ping | For staff: asks the boat to save its own GPS fix as a buoy of the selected type. |
| Draw / Clear line | Draw creates an orange dashed line between Committee and Pin and becomes Clear line. Clicking again clears only the line and restores Draw, keeping buoys and track. Both buoys are required to draw it. |
