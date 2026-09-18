import test from "node:test";
import assert from "node:assert/strict";
import { DashboardState, brokerUrl } from "../state.js";
import { TOPICS, SETTINGS } from "../config.js";

const telemetry = {
  attitude_valid: true, roll_deg: 12, pitch_deg: 2, yaw_deg: 370,
  height_valid: true, height_m: -.1, battery_valid: true, battery_low: false,
  sog_valid: true, sog_mps: 6,
};
test("invalid values remain unknown and stale samples expire independently", () => {
  let now = 0;
  const s = new DashboardState(() => now);
  s.ingest(TOPICS.telemetry, telemetry);
  assert.equal(s.values().yaw, 370);
  assert.equal(s.values().height, -.1);
  assert.equal(s.values().battery, false);
  now = 2000;
  s.ingest(TOPICS.position, { fix_valid: true, latitude_deg: 59, longitude_deg: 18, sog_mps: 5 });
  now = 3100;
  assert.equal(s.values().roll, null);
  assert.equal(s.values().latitude, 59);
  s.ingest(TOPICS.telemetry, { ...telemetry, attitude_valid: false, height_m: null, battery_low: "false" });
  assert.equal(s.values().roll, null);
  assert.equal(s.values().height, null);
  assert.equal(s.values().battery, null);
});
test("commands require connection, fresh state and the appropriate recording state", () => {
  let now = 0;
  const s = new DashboardState(() => now);
  s.ingest(TOPICS.recording, { recording: false, bag_name: "", last_error: "" });
  assert.equal(s.canCommand("start"), false);
  s.ready = true;
  assert.equal(s.canCommand("start"), true);
  assert.equal(s.canCommand("stop"), false);
  assert.equal(s.canCommand("shutdown"), false);
  now = SETTINGS.recordingTimeoutMs;
  assert.throws(() => s.begin("start", "one"));
});
test("RPC accepts only the matching topic and request ID, then waits for a new state", () => {
  const s = new DashboardState(() => 0);
  s.ready = true;
  s.ingest(TOPICS.recording, { recording: false, bag_name: "", last_error: "" });
  assert.deepEqual(s.begin("start", "one"), { requestId: "one" });
  assert.equal(s.canCommand("start"), false);
  const response = { requestId: "one", success: true, error_message: "", bag_name: "bag" };
  assert.equal(s.response(TOPICS.stopResponse, response), null);
  assert.equal(s.response(TOPICS.startResponse, { ...response, requestId: "other" }), null);
  assert.equal(s.response(TOPICS.startResponse, response), response);
  assert.equal(s.canCommand("start"), false);
  s.ingest(TOPICS.recording, { recording: true, bag_name: "bag", last_error: "" });
  assert.equal(s.canCommand("stop"), true);
});
test("timeouts and disconnects do not assume a command succeeded", () => {
  let now = 0;
  const s = new DashboardState(() => now);
  s.ready = true;
  s.ingest(TOPICS.recording, { recording: false, bag_name: "", last_error: "" });
  s.begin("start", "one");
  now = SETTINGS.commandTimeoutMs;
  assert.equal(s.expire(), true);
  assert.equal(s.recording(), null);
  s.reset();
  assert.equal(s.ready, false);
  assert.equal(s.values().sog, null);
});
test("malformed messages and out-of-range positions are not presented as valid", () => {
  const s = new DashboardState();
  assert.equal(s.ingest(TOPICS.recording, { recording: "false" }), false);
  assert.equal(s.ingest(TOPICS.telemetry, []), false);
  s.ingest(TOPICS.position, { fix_valid: true, latitude_deg: 181, longitude_deg: 12 });
  assert.equal(s.values().latitude, null);
});
test("broker address must use WSS without embedded credentials", () => {
  assert.equal(brokerUrl("wss://example.org:8884/mqtt"), "wss://example.org:8884/mqtt");
  for (const value of ["ws://example.org", "https://example.org", "wss://user:pass@example.org",
      "wss://example.org?password=secret", "wss://example.org#x", "not a URL"]) {
    assert.throws(() => brokerUrl(value));
  }
});

