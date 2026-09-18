# Ågir boat dashboard

A first static HTML/CSS/JavaScript dashboard for the Agir ROS environment.
No application backend, build step, or installation is needed for hosting.
It uses MQTT.js 5.15.2 from jsDelivr; fonts load from Google Fonts with a system
fallback. These are external network dependencies, not broker credentials.

## First look

Serve this folder with any local static web server and open its HTTP address.
For example, from this folder: `python -m http.server 8080 --bind 127.0.0.1`.
Choose **Explore demo** to inspect simulated instruments without a broker.
Demo mode disables recording commands. ES modules require HTTP/HTTPS; opening
index.html as a file is not supported.

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
| `agir_gui/data/telemetry` | ROS WebTelemetry converted to JSON: timestamp; roll/pitch/yaw in aerospace degrees; height in metres; battery low alarm; SOG in m/s; validity flags |
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
verify real telemetry and recording responses, then decide on charts/maps.

