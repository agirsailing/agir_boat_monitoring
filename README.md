# Ågir boat dashboard

A first static HTML/CSS/JavaScript dashboard for the Agir ROS environment.
No application backend, build step, or installation is needed for hosting.
It uses MQTT.js 5.15.2 and Leaflet 1.9.4 from jsDelivr; fonts load from Google Fonts with a system
fallback. These are external network dependencies, not broker credentials.

## First look

Publish this folder on GitHub Pages, including the `pages/` directory, and open
the site's HTTPS address. No local server or application backend is needed.
Choose **Explore demo** to inspect simulated instruments without a broker.
Demo mode disables recording commands. ES modules require HTTP/HTTPS; opening
index.html as a file is not supported.

## Dashboard and Map

Use the navbar to switch between `#dashboard` and `#map`. Hash routes work on
static hosts, support browser Back/Forward and keep the MQTT connection alive.
The two views live in separate HTML files loaded into the common shell once:

| File | Responsibility |
| --- | --- |
| `index.html` | Shared login, navbar, page heading and footer |
| `pages/dashboard.html` | Instruments, ultrasonic distances and recording controls |
| `pages/map.html` | Map container and follow control |
| `pages.js` | View loading, route definitions and navigation |
| `dashboard.js` | Dashboard display updates |
| `map.js` | Map and boat marker updates |
| `app.js` | Shared MQTT session, demo mode and commands |

The HTML views are fragments, not standalone entry points: use the site's
`/#dashboard` or `/#map` links rather than opening files under `pages/` directly.
All asset paths are relative so the site also works under a GitHub Pages project
path. To add a view, add its HTML file, register it in `pages.js` and add a navbar
link in `index.html`; keep its display logic in a separate JavaScript module.

The dashboard includes separate left/port and right/starboard ultrasonic distance
cards in metres. These are raw beam distances, separate from corrected boat height.

The [Leaflet map](https://leafletjs.com/reference) initializes at Stockholm
(59.3293, 18.0686), zoom 13, with OpenStreetMap tiles and attribution.
Map scripts and tiles require Internet access. The boat arrow uses absolute
latitude/longitude from the position stream, never coordinate deltas. Follow is
on by default; dragging the map turns it off, and the Follow boat button restores it.
Its direction is estimated from successive GPS positions at least one metre apart,
not from startup-relative IMU yaw. Before movement, direction is marked unavailable.
An invalid or stale fix removes the arrow. Demo mode simulates a moving GPS position
and both ultrasonic sensors, and is also accessible from the login screen.

The map draws a GPS track for the current browser session, including samples
received while viewing the dashboard or before first opening the map. Repeated
coordinates are ignored. GPS gaps and connection interruptions start a new
segment while preserving the previous track. Starting a new login or entering
or exiting demo mode clears the track; reloading the page also clears it.
The track is held only in memory, not saved on the boat or in browser storage.

The toolbar reserves **Reset track**, **Draw**, **Ping** (currently disabled),
and a buoy-type selector with **PIN**, **COMITATO**, **BOLINA**. Selecting a
type does not place a buoy or send commands; these controls are placeholders.

## Architecture

GitHub Pages serves the files to the operator's browser. The browser then
connects directly to an Internet-accessible MQTT broker over **WSS**.
The Raspberry connects to the same broker using MQTT over TLS.

```text
Raspberry / ROS <-- MQTT over TLS --> broker <-- MQTT over WSS --> browser
                                                                  ^
                                                      HTML/CSS/JS from Pages
```

The recording buttons call the existing ROS gateway through MQTT. MCAP files
remain on the Raspberry: the website does not record or download them.
The broker and the boat must be online; Pages alone is not an MQTT broker.

## Credentials and broker setup

1. Create a private broker/tenant that supports MQTT over TLS and secure
   WebSockets. Copy its exact WSS URL, including the port and path, into the form.
   Do not use the native MQTT/TLS port as a WebSocket port.
2. Create a **boat MQTT client credential** and enter it into the ROS package's
   local, Git-ignored `communication_web/config/mqtt_config.yaml`.
3. Create a separate **operator MQTT client credential**. Enter it in the
   dashboard form. This is not your HiveMQ/Mosquitto administrator account.
4. Apply topic permissions on the broker (the exact UI depends on its plan).
   Browser buttons and public source code are not authorization controls.

| Credential | Publish | Subscribe |
| --- | --- | --- |
| Boat | `agir_gui/data/#`, `agir_gui/rsp/#` | `agir_gui/cmd/start_recording`, `agir_gui/cmd/stop_recording` |
| Operator | `agir_gui/cmd/start_recording`, `agir_gui/cmd/stop_recording` | `agir_gui/data/#`, `agir_gui/rsp/#` |

The app keeps connection credentials only in the current page's memory, for
reconnection, and releases references on Disconnect/page exit. It does not use
cookies, localStorage or sessionStorage. Password-manager behaviour is controlled
by the browser. The operator can inspect their own credentials in their browser;
they are not exposed to other visitors through the hosted files.

**Never embed a password in HTML, JavaScript, config.js or a GitHub Actions
build.** GitHub Secrets do not provide private runtime variables to a static
website: any value inserted into delivered JavaScript becomes visible.
Gitignore does not protect a file that is already tracked or remove history.

## Data contract

`config.js` centralizes the MQTT topics. Keep it aligned with
`sailing_ros/ros2_ws/src/communication_web/config/endpoints.yaml`.
No ROS endpoint generator is run by this website.

| MQTT topic | Data |
| --- | --- |
| `agir_gui/data/telemetry` | ROS WebTelemetry converted to JSON: timestamp; roll/pitch/yaw in aerospace degrees; height and left/right ultrasonic distances in metres; battery low alarm; SOG in m/s; validity flags |
| `agir_gui/data/position` | ROS BoatPosition converted to JSON: latitude/longitude in decimal degrees; SOG in m/s; GPS timestamp and fix validity |
| `agir_gui/data/recording_state` | recording (boolean), bag_name, last_error |
| `agir_gui/cmd/start_recording` and `stop_recording` | JSON object with a unique requestId |
| `agir_gui/rsp/start_recording` and `stop_recording` | requestId, success, error_message, bag_name |

Yaw is relative to IMU startup, **not north**. Height refers to the design
waterline below the centre of mass and can be negative. Battery status is only
a low alarm, not charge percentage or a complete battery-health assessment.

Invalid sensor flags and non-finite/missing numbers appear as a dash. Data
expires by browser reception time after 3 seconds; recording state after
5 seconds. Upstream sensor timestamps/validity are checked by the ROS gateway.
Settings are centralized in `config.js`.

Ultrasonic fields are `ultrasonic_left_m`, `ultrasonic_left_valid`,
`ultrasonic_right_m`, `ultrasonic_right_valid`. Each side is validated independently.
Older gateways without these fields show dashes until ROS is rebuilt and restarted.

Commands require a connected/subscribed client and a fresh recording state.
They use QoS 1, retain=false and request IDs matched against the correct reply
topic. A broker acknowledgment alone is not ROS confirmation. There is no
automatic retry of commands: after a lost reply (22-second timeout) or an outage,
the outcome is unknown until fresh boat state arrives. A subsequent state is
also required after a reply. Reconnection creates a fresh session and discards
old outbound queues. Retained messages are ignored.

## GitHub Pages (when ready)

Upload this folder's contents to a separate GitHub repository. In its Pages
settings, select the branch and root folder as the publishing source. Keep
`index.html` at that root. Relative asset paths support project Pages URLs.
There are no environment variables to configure and no build workflow is needed.
Nothing has been published automatically.

Only publish these web files. Never copy the Raspberry's MQTT YAML or ROS
install directory into this repository. Publishing the site makes its interface
and code accessible; broker authentication and ACLs protect boat data/commands.

## Offline checks

With Node.js installed, run `npm test` (or `node --test test/*.test.js`).
The tests use fake MQTT clients and do not contact a broker, ROS or hardware.
A real broker/Pi integration test still needs to be performed.

Next iterations: agree on layout with the team, configure the broker and ACLs,
verify real telemetry and recording responses, then decide on charts.
