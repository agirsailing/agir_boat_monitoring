import test from "node:test";
import assert from "node:assert/strict";
import { createRenderScheduler, LiveDiagnostics } from "../src/core/live-runtime.js";

test("bursts and a background pause keep one paint and show only the latest state", () => {
  const pending = new Map();
  let id = 0, latest = 0;
  const paints = [];
  const schedule = createRenderScheduler(() => paints.push(latest), assert.fail,
    callback => { pending.set(++id, callback); return id; }, key => pending.delete(key));
  // Even while animation frames are paused, no paint-per-message queue builds up.
  for (let i = 1; i <= 20000; i++) { latest = i; schedule(); }
  assert.equal(pending.size, 1);
  const callback = pending.values().next().value;
  pending.clear();
  callback();
  assert.deepEqual(paints, [20000]);
  schedule();
  assert.equal(pending.size, 1);
  schedule.cancel();
  assert.equal(pending.size, 0);
});

test("a paint failure is reported and subsequent renders can recover", () => {
  let callback, attempts = 0;
  const errors = [];
  const schedule = createRenderScheduler(() => {
    if (++attempts === 1) throw new Error("test paint failure");
  }, error => errors.push(error), fn => { callback = fn; return 1; }, () => {});
  schedule(); callback();
  schedule(); callback();
  assert.equal(errors.length, 1);
  assert.equal(attempts, 2);
});

test("diagnostics distinguish growing transport age, missing messages and slow rendering", () => {
  let now = 0, wall = 100000;
  const d = new LiveDiagnostics(() => now, () => wall);
  const message = (ms, valid = true) => ({
    header: { stamp: { sec: Math.floor(ms / 1000), nanosec: ms % 1000 * 1e6 } },
    ultrasonic_left_valid: valid, ultrasonic_right_valid: true,
  });
  d.receive(message(99900), 900);
  d.rendered(2);
  // Simulate ten minutes at 4 Hz with fixed counters, no retained payload history.
  const keys = Object.keys(d);
  for (let i = 0; i < 2400; i++) {
    now += 250; wall += 250;
    d.receive(message(wall - 100), 900);
    d.tick(250);
    d.rendered(2);
  }
  assert.deepEqual(Object.keys(d), keys);
  assert.equal(d.snapshot().dashboardMessages, 2401);
  assert.equal(d.snapshot().addedAgeSinceBestMs, 0);
  now += 250; wall += 250;
  d.receive(message(wall - 2100, false), 900);
  assert.equal(d.snapshot().addedAgeSinceBestMs, 2000);
  assert.equal(d.snapshot().messagesSinceLastPaint, 1);
  assert.equal(d.snapshot().ultrasonicLeftValid, false);
  d.rendered(120);
  now += 3500; wall += 3500;
  d.tick(250);
  assert.equal(d.snapshot().sinceLastReceiveMs, 3500);
  assert.equal(d.snapshot().lastEventLoopLagMs, 3500);
  assert.equal(d.snapshot().maxPaintMs, 120);
  assert.equal(d.snapshot().messagesSinceLastPaint, 0);
});
