import test from "node:test";
import assert from "node:assert/strict";
import { DashboardState } from "../src/core/state.js";
import { TOPICS, SETTINGS } from "../src/config.js";
import { headerNow } from "./helpers.js";

const epoch = 1700000000000;
const dashboard = ms => ({ header: headerNow(ms), attitude_valid: true, roll_deg: 12,
  height_valid: false, battery_valid: false, sog_valid: false });
const map = ms => ({ header: headerNow(ms), fix_valid: true,
  latitude_deg: 59, longitude_deg: 18, marks: [{ type: 0, lat: 59, lon: 18 }] });

test("already delayed MQTT data cannot revive values, position or buoy ping", () => {
  const s = new DashboardState(() => 0, () => epoch);
  s.ready = s.pingAllowed = true;
  assert.equal(s.ingest(TOPICS.telemetry, dashboard(epoch - 4000)), false);
  assert.equal(s.ingest(TOPICS.position, map(epoch - 4000)), false);
  assert.equal(s.values().roll, null);
  assert.equal(s.values().latitude, null);
  assert.equal(s.canPing(), false);
  assert.deepEqual(s.marks(), []);
  assert.match(s.freshnessWarning(), /delayed/);
  s.ingest(TOPICS.telemetry, dashboard(epoch));
  s.ingest(TOPICS.position, map(epoch));
  assert.equal(s.values().roll, 12);
  assert.equal(s.canPing(), true);
  assert.equal(s.freshnessWarning(), "");
});

test("transit time consumes the freshness budget instead of restarting it", () => {
  let elapsed = 0;
  const s = new DashboardState(() => elapsed, () => epoch + elapsed);
  s.ingest(TOPICS.telemetry, dashboard(epoch - 2500));
  elapsed = 499;
  assert.equal(s.values().roll, 12);
  elapsed = 500;
  assert.equal(s.values().roll, null);
  s.ingest(TOPICS.telemetry, dashboard(epoch - 2500)); // Redelivery of same packet.
  assert.equal(s.values().roll, null);
});

test("future and missing/malformed timestamps fail closed with an explanation", () => {
  const s = new DashboardState(() => 0, () => epoch);
  for (const header of [undefined, {}, { stamp: { sec: 0, nanosec: 0 } },
    { stamp: { sec: "1700000000", nanosec: 0 } },
    { stamp: { sec: 1700000000, nanosec: 1e9 } }]) {
    assert.equal(s.ingest(TOPICS.position, { ...map(epoch), header }), false);
    assert.equal(s.values().latitude, null);
    assert.match(s.freshnessWarning(), /timestamp/);
  }
  s.ingest(TOPICS.position, map(epoch + SETTINGS.clockToleranceMs + 1));
  assert.equal(s.values().latitude, null);
  assert.match(s.freshnessWarning(), /clocks/);
  s.ingest(TOPICS.position, map(epoch + 100));
  assert.equal(s.values().latitude, 59);
});

test("out of order deliveries do not replace a newer live position", () => {
  const s = new DashboardState(() => 0, () => epoch);
  s.ingest(TOPICS.position, map(epoch));
  assert.equal(s.ingest(TOPICS.position, { ...map(epoch - 1000), latitude_deg: 58 }), false);
  assert.equal(s.values().latitude, 59);
});

test("clock adjustment never extends the lifetime of a received sample", () => {
  let elapsed = 0;
  let wall = epoch;
  const s = new DashboardState(() => elapsed, () => wall);
  s.ingest(TOPICS.telemetry, dashboard(epoch));
  wall -= 500; // Within the allowed clock tolerance.
  elapsed = 3000;
  assert.equal(s.values().roll, null);
  s.reset();
  assert.equal(s.freshnessWarning(), "");
});

test("a rejected future message does not become live just by waiting", () => {
  let elapsed = 0;
  const s = new DashboardState(() => elapsed, () => epoch + elapsed);
  s.ingest(TOPICS.position, map(epoch + 1500));
  elapsed = 1500;
  assert.equal(s.values().latitude, null);
});
