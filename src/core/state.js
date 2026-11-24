import { TOPICS, SETTINGS } from "../config.js";
import { MARK_NAMES, validMark, validMarks } from "./marks.js";

export const finite = value => typeof value === "number" && Number.isFinite(value);

function timestampMs(data) {
  const stamp = data?.header?.stamp;
  if (!Number.isInteger(stamp?.sec) || stamp.sec < 0 ||
      !Number.isInteger(stamp?.nanosec) || stamp.nanosec < 0 || stamp.nanosec >= 1e9) return null;
  const ms = stamp.sec * 1000 + stamp.nanosec / 1e6;
  return ms > 0 && Number.isSafeInteger(stamp.sec * 1000) ? ms : null;
}

export function brokerUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Use the broker's wss:// address, without credentials or query parameters.");
  }
  return url.href;
}

export class DashboardState {
  constructor(now = () => performance.now(), wallNow = () => Date.now()) {
    this.now = now;
    this.wallNow = wallNow;
    this.reset();
  }

  reset() {
    this.samples = {};
    this.pending = null;
    this.pingPending = null;
    this.ready = false;
    this.pingAllowed = false;
  }

  ingest(topic, data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (topic === TOPICS.telemetry && typeof data.attitude_valid === "boolean" &&
        typeof data.height_valid === "boolean" && typeof data.battery_valid === "boolean" &&
        typeof data.sog_valid === "boolean") {
      return this.ingestStamped("telemetry", data);
    } else if (topic === TOPICS.position && typeof data.fix_valid === "boolean") {
      return this.ingestStamped("position", data);
    } else if (topic === TOPICS.recording && typeof data.recording === "boolean" &&
        typeof data.bag_name === "string" && typeof data.last_error === "string") {
      this.samples.recording = { data, at: this.now() };
    } else {
      return false;
    }
    return true;
  }

  ingestStamped(name, data) {
    const sourceAt = timestampMs(data);
    const age = sourceAt === null ? Infinity : this.wallNow() - sourceAt;
    // Ignore an older delivery while a newer sample is still usable. A new
    // boat clock epoch can recover once that sample expires.
    const previous = this.samples[name];
    if (sourceAt !== null && previous?.sourceAt > sourceAt && this.fresh(name)) return false;
    const issue = sourceAt === null ? "timestamp"
      : age < -SETTINGS.clockToleranceMs ? "clock"
      : age >= SETTINGS.dataTimeoutMs ? "delay" : null;
    this.samples[name] = {
      data, at: this.now(), sourceAt, ageAtReceipt: Math.max(0, age), issue,
    };
    return !issue;
  }

  fresh(name, timeout = SETTINGS.dataTimeoutMs) {
    const sample = this.samples[name];
    if (!sample || sample.issue) return null;
    const elapsed = this.now() - sample.at;
    if (elapsed < 0 || elapsed >= timeout) return null;
    if (name !== "recording") {
      const age = this.wallNow() - sample.sourceAt;
      // Monotonic time prevents clock corrections from rejuvenating a sample.
      if (age < -SETTINGS.clockToleranceMs ||
          Math.max(age, sample.ageAtReceipt + elapsed) >= timeout) return null;
    }
    // RecordingState currently has no header; it uses the receipt timeout.
    return sample.data;
  }

  freshnessWarning() {
    for (const name of ["telemetry", "position"]) {
      const sample = this.samples[name];
      if (!sample || this.now() - sample.at >= SETTINGS.dataTimeoutMs || this.fresh(name)) continue;
      if (sample.issue === "timestamp") return "Boat data has no valid timestamp. Update the boat software.";
      return "Boat data is delayed or device clocks are out of sync. Check the connection and automatic time on the Raspberry and this device.";
    }
    return "";
  }

  recording() {
    return this.fresh("recording", SETTINGS.recordingTimeoutMs);
  }

  marks() {
    const marks = this.fresh("position")?.marks;
    return validMarks(marks) ? marks : [];
  }

  canDraw() {
    const marks = this.marks();
    return marks.some(mark => mark.type === 0) && marks.some(mark => mark.type === 1);
  }

  canPing() {
    const position = this.fresh("position");
    const values = this.values();
    // Requiring marks also avoids sending pings to an older boat deployment.
    return this.ready && this.pingAllowed && !this.pingPending && validMarks(position?.marks) &&
      values.latitude !== null && values.longitude !== null;
  }

  beginPing(type, requestId) {
    if (!this.pingAllowed) throw new Error("Only Staff can ping buoys. You can view saved buoys on the map.");
    if (!this.canPing()) throw new Error("Wait for a fresh GPS fix and map state from the boat.");
    if (!Number.isInteger(type) || !Object.hasOwn(MARK_NAMES, type)) {
      throw new Error("Select a valid buoy type.");
    }
    this.pingPending = { type, requestId, at: this.now() };
    return { requestId, type };
  }

  pingResponse(topic, data) {
    const pending = this.pingPending;
    if (!pending || topic !== TOPICS.pingResponse || !data ||
        data.requestId !== pending.requestId || typeof data.success !== "boolean" ||
        typeof data.error_message !== "string" ||
        (data.success && (!validMark(data.mark) || data.mark.type !== pending.type))) return null;
    this.pingPending = null;
    // Only the periodic map state updates markers, including after a lost reply.
    return data;
  }

  expirePing() {
    if (!this.pingPending || this.now() - this.pingPending.at < SETTINGS.commandTimeoutMs) return false;
    this.pingPending = null;
    return true;
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
    const range = side => {
      const distance = value(`ultrasonic_${side}_valid`, `ultrasonic_${side}_m`);
      return distance !== null && distance >= 0 ? distance : null;
    };
    const fix = p?.fix_valid === true && finite(p.latitude_deg) && finite(p.longitude_deg) &&
      Math.abs(p.latitude_deg) <= 90 && Math.abs(p.longitude_deg) <= 180;
    return {
      roll: value("attitude_valid", "roll_deg"),
      pitch: value("attitude_valid", "pitch_deg"),
      yaw: value("attitude_valid", "yaw_deg"),
      height: value("height_valid", "height_m"),
      ultrasonicLeft: range("left"),
      ultrasonicRight: range("right"),
      sog: value("sog_valid", "sog_mps"),
      battery: t?.battery_valid === true && typeof t.battery_low === "boolean" ? t.battery_low : null,
      batteryVoltage: value("battery_valid", "battery_voltage_v"),
      latitude: fix ? p.latitude_deg : null,
      longitude: fix ? p.longitude_deg : null,
      positionSog: fix && finite(p.sog_mps) ? p.sog_mps : null,
      timestamp: t?.header?.stamp ?? null,
    };
  }
}
