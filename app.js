import { TOPICS } from "./config.js";
import { DashboardState, finite } from "./state.js";
import { BrokerConnection } from "./mqtt-connection.js";

const el = id => document.getElementById(id);
const state = new DashboardState();
let demo = false;
let demoTimer = null;
let linkStatus = "disconnected";
const format = (value, decimals = 1) => finite(value) ? value.toFixed(decimals) : "—";
const setText = (id, value) => { el(id).textContent = value; };
const feedback = text => setText("command-status", text);
const connectionError = text => {
  setText("connection-error", text);
  el("connection-error").hidden = !text;
};

const connection = new BrokerConnection(status => {
  linkStatus = status;
  if (status !== "connected") {
    if (state.pending) feedback("Connection lost. Command outcome unknown; check the next boat state.");
    state.reset();
  } else {
    state.ready = true;
    feedback("Connected. Waiting for the boat's recording state.");
  }
  render();
}, (topic, data) => {
  const response = state.response(topic, data);
  if (response) {
    feedback(response.success
      ? "Boat confirmed the command. Waiting for updated recording state."
      : "Boat rejected the command: " + response.error_message);
  } else {
    state.ingest(topic, data);
  }
  render();
});

function render() {
  const values = state.values();
  for (const name of ["roll", "pitch", "yaw", "sog"]) setText(name, format(values[name]));
  setText("height", format(values.height, 2));
  setText("latitude", finite(values.latitude) ? values.latitude.toFixed(6) + "°" : "—");
  setText("longitude", finite(values.longitude) ? values.longitude.toFixed(6) + "°" : "—");
  setText("position-sog", finite(values.positionSog) ? values.positionSog.toFixed(2) + " m/s" : "—");
  setText("battery", values.battery === null ? "Unknown" : values.battery ? "Low battery" : "No low alarm");
  el("battery-light").dataset.tone = values.battery === null ? "" : values.battery ? "alert" : "good";
  const stamp = values.timestamp;
  const time = stamp && finite(stamp.sec) && finite(stamp.nanosec)
    ? new Date(stamp.sec * 1000 + stamp.nanosec / 1e6) : null;
  setText("timestamp", time && !Number.isNaN(time.valueOf()) ? time.toISOString() : "—");
  const names = { disconnected: "Disconnected", connecting: "Connecting…",
    connected: "Broker connected", reconnecting: "Retrying connection…" };
  setText("connection-status", demo ? "Demo mode" : names[linkStatus]);
  el("connection-status").dataset.tone = linkStatus === "connected" && !demo ? "good" : "";
  setText("freshness", demo ? "Simulated data" : state.fresh("telemetry") ? "Receiving telemetry" : "Waiting for the boat");
  const recording = state.recording();
  setText("recording-status", demo ? "Demo" : !recording ? "Unknown" : recording.recording ? "Recording" : "Idle");
  el("recording-status").dataset.tone = !demo && recording?.recording ? "alert" : "";
  setText("bag-name", recording?.bag_name || "—");
  setText("recording-error", recording?.last_error || "");
  el("recording-error").hidden = !recording?.last_error;
  el("start").disabled = demo || !state.canCommand("start");
  el("stop").disabled = demo || !state.canCommand("stop");
  const active = linkStatus !== "disconnected";
  for (const id of ["connect", "broker", "username", "password"]) {
    if (el(id)) el(id).disabled = active;
  }
  if (el("disconnect")) el("disconnect").disabled = !active;
  if (el("demo-banner")) el("demo-banner").hidden = !demo;
  setText("demo", demo ? "Exit demo" : "Explore demo");

  // Toggle pages
  const isLogged = active || demo;
  if (el("login-overlay")) el("login-overlay").hidden = isLogged;
  if (el("app-content")) el("app-content").hidden = !isLogged;
  
  if (isLogged && el("current-user")) {
    setText("current-user", demo ? "Demo user" : el("username").value);
  }
}

function endDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  demo = false;
  state.reset();
}

el("connect-form").addEventListener("submit", event => {
  event.preventDefault();
  connectionError("");
  endDemo();
  try {
    connection.connect(el("broker").value, el("username").value, el("password").value);
  } catch (error) {
    connection.disconnect();
    connectionError(error.message);
  }
  render();
});

el("disconnect").addEventListener("click", () => {
  connection.disconnect();
  feedback("Disconnected. No recording commands will be sent.");
});

function command(action) {
  if (demo) return;
  try {
    const payload = state.begin(action, crypto.randomUUID());
    feedback("Request sent. Waiting for confirmation from the boat…");
    connection.publish(action, payload, () => {
      state.pending = null;
      delete state.samples.recording;
      feedback("Command delivery failed. Outcome unknown; wait for the boat state.");
      render();
    });
  } catch (error) {
    state.pending = null;
    feedback(error.message);
  }
  render();
}
el("start").addEventListener("click", () => command("start"));
el("stop").addEventListener("click", () => command("stop"));

el("demo").addEventListener("click", () => {
  if (demo) {
    endDemo();
    feedback("Connect and wait for the boat's recording state.");
  } else {
    connection.disconnect();
    connectionError("");
    demo = true;
    const tick = () => {
      const wave = Math.sin(performance.now() / 3000);
      const stamp = { sec: Math.floor(Date.now() / 1000), nanosec: 0 };
      state.ingest(TOPICS.telemetry, {
        header: { stamp }, attitude_valid: true, roll_deg: 12 + wave,
        pitch_deg: 1.4 + wave * .2, yaw_deg: 32 + wave * 2,
        height_valid: true, height_m: .48 + wave * .02,
        battery_valid: true, battery_low: false, sog_valid: true, sog_mps: 6.2 + wave * .3,
      });
      state.ingest(TOPICS.position, {
        header: { stamp }, gps_stamp: stamp, fix_valid: true,
        latitude_deg: 59.3293, longitude_deg: 18.0686, sog_mps: 6.2 + wave * .3,
      });
      render();
    };
    feedback("Demo only. Connect to your broker to control real recordings.");
    tick();
    demoTimer = setInterval(tick, 500);
  }
  render();
});

setInterval(() => {
  if (state.expire()) feedback("No reply received. Outcome unknown; check the next boat state before retrying.");
  render();
}, 250);

window.addEventListener("pagehide", () => {
  endDemo();
  connection.disconnect();
});
render();

