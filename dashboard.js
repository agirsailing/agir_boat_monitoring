import { finite } from "./state.js";

const el = id => document.getElementById(id);
const setText = (id, value) => { el(id).textContent = value; };
const format = (value, decimals = 1) => finite(value) ? value.toFixed(decimals) : "—";

export function renderDashboard(state, demo) {
  const values = state.values();
  for (const name of ["roll", "pitch", "yaw", "sog"]) setText(name, format(values[name]));
  setText("height", format(values.height, 2));
  setText("ultrasonic-left", format(values.ultrasonicLeft, 2));
  setText("ultrasonic-right", format(values.ultrasonicRight, 2));
  setText("latitude", finite(values.latitude) ? values.latitude.toFixed(6) + "°" : "—");
  setText("longitude", finite(values.longitude) ? values.longitude.toFixed(6) + "°" : "—");
  setText("position-sog", finite(values.positionSog) ? values.positionSog.toFixed(2) + " m/s" : "—");
  setText("battery", values.battery === null ? "Unknown" : values.battery ? "Low battery" : "No low alarm");
  el("battery-light").dataset.tone = values.battery === null ? "" : values.battery ? "alert" : "good";
  const stamp = values.timestamp;
  const time = stamp && finite(stamp.sec) && finite(stamp.nanosec)
    ? new Date(stamp.sec * 1000 + stamp.nanosec / 1e6) : null;
  setText("timestamp", time && !Number.isNaN(time.valueOf()) ? time.toISOString() : "—");
  setText("freshness", demo ? "Simulated data" : state.fresh("telemetry") ? "Receiving telemetry" : "Waiting for the boat");
  const recording = state.recording();
  setText("recording-status", demo ? "Demo" : !recording ? "Unknown" : recording.recording ? "Recording" : "Idle");
  el("recording-status").dataset.tone = !demo && recording?.recording ? "alert" : "";
  setText("bag-name", recording?.bag_name || "—");
  setText("recording-error", recording?.last_error || "");
  el("recording-error").hidden = !recording?.last_error;
  el("start").disabled = demo || !state.canCommand("start");
  el("stop").disabled = demo || !state.canCommand("stop");
}
