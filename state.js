import { TOPICS, SETTINGS } from "./config.js";

export const finite = value => typeof value === "number" && Number.isFinite(value);

export function brokerUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Use the broker's wss:// address, without credentials or query parameters.");
  }
  return url.href;
}

export class DashboardState {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.samples = {};
    this.pending = null;
    this.ready = false;
  }

  ingest(topic, data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (topic === TOPICS.telemetry && typeof data.attitude_valid === "boolean" &&
        typeof data.height_valid === "boolean" && typeof data.battery_valid === "boolean" &&
        typeof data.sog_valid === "boolean") {
      this.samples.telemetry = { data, at: this.now() };
    } else if (topic === TOPICS.position && typeof data.fix_valid === "boolean") {
      this.samples.position = { data, at: this.now() };
    } else if (topic === TOPICS.recording && typeof data.recording === "boolean" &&
        typeof data.bag_name === "string" && typeof data.last_error === "string") {
      this.samples.recording = { data, at: this.now() };
    } else {
      return false;
    }
    return true;
  }

  fresh(name, timeout = SETTINGS.dataTimeoutMs) {
    const sample = this.samples[name];
    return sample && this.now() - sample.at < timeout ? sample.data : null;
  }

  recording() {
    return this.fresh("recording", SETTINGS.recordingTimeoutMs);
  }

  canCommand(action) {
    const recording = this.recording();
    return this.ready && !this.pending && recording !== null &&
      ((action === "start" && !recording.recording) || (action === "stop" && recording.recording));
  }

  begin(action, requestId) {
    if (!this.canCommand(action)) throw new Error("Wait for a fresh recording state from the boat.");
    this.pending = { action, requestId, at: this.now() };
    return { requestId };
  }

  response(topic, data) {
    const pending = this.pending;
    if (!pending || topic !== TOPICS[pending.action + "Response"] ||
        !data || data.requestId !== pending.requestId ||
        typeof data.success !== "boolean" || typeof data.error_message !== "string" ||
        typeof data.bag_name !== "string") return null;
    this.pending = null;
    // Wait for a subsequent periodic state; an RPC reply is not the state stream.
    delete this.samples.recording;
    return data;
  }

  expire() {
    if (!this.pending || this.now() - this.pending.at < SETTINGS.commandTimeoutMs) return false;
    this.pending = null;
    delete this.samples.recording;
    return true;
  }

  values() {
    const t = this.fresh("telemetry");
    const p = this.fresh("position");
    const value = (flag, field) => t?.[flag] === true && finite(t[field]) ? t[field] : null;
    const fix = p?.fix_valid === true && finite(p.latitude_deg) && finite(p.longitude_deg) &&
      Math.abs(p.latitude_deg) <= 90 && Math.abs(p.longitude_deg) <= 180;
    return {
      roll: value("attitude_valid", "roll_deg"),
      pitch: value("attitude_valid", "pitch_deg"),
      yaw: value("attitude_valid", "yaw_deg"),
      height: value("height_valid", "height_m"),
      sog: value("sog_valid", "sog_mps"),
      battery: t?.battery_valid === true && typeof t.battery_low === "boolean" ? t.battery_low : null,
      latitude: fix ? p.latitude_deg : null,
      longitude: fix ? p.longitude_deg : null,
      positionSog: fix && finite(p.sog_mps) ? p.sog_mps : null,
      timestamp: t?.header?.stamp ?? null,
    };
  }
}

