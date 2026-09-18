// Public configuration only. Never put passwords or tokens in this file.
export const TOPICS = Object.freeze({
  telemetry: "agir_gui/data/telemetry",
  position: "agir_gui/data/position",
  recording: "agir_gui/data/recording_state",
  start: "agir_gui/cmd/start_recording",
  stop: "agir_gui/cmd/stop_recording",
  startResponse: "agir_gui/rsp/start_recording",
  stopResponse: "agir_gui/rsp/stop_recording",
});

export const SETTINGS = Object.freeze({
  dataTimeoutMs: 3000,
  recordingTimeoutMs: 5000,
  commandTimeoutMs: 22000,
  reconnectMs: 5000,
  connectTimeoutMs: 12000,
  maxPayloadBytes: 65536,
});

