// Public configuration only. Never put passwords or tokens in this file.
export const TOPICS = Object.freeze({
  telemetry: "agir_gui/data/dashboard",
  position: "agir_gui/data/map",
  recording: "agir_gui/data/recording_state",
  start: "agir_gui/cmd/start_recording",
  stop: "agir_gui/cmd/stop_recording",
  startResponse: "agir_gui/rsp/start_recording",
  stopResponse: "agir_gui/rsp/stop_recording",
  ping: "agir_gui/cmd/ping_mark",
  pingResponse: "agir_gui/rsp/ping_mark",
});


// UI permissions only: the broker must independently enforce publish ACLs.
// Match MQTT usernames exactly (case-sensitive); unknown accounts are viewers.
export const STAFF_USERNAMES = Object.freeze(["agir-staff"]);

export const SETTINGS = Object.freeze({
  dataTimeoutMs: 3000,
  recordingTimeoutMs: 5000,
  commandTimeoutMs: 22000,
  reconnectMs: 5000,
  connectTimeoutMs: 12000,
  maxPayloadBytes: 65536,
});

