import test from "node:test";
import assert from "node:assert/strict";
import { isStaff } from "../src/core/permissions.js";
import { DashboardState } from "../src/core/state.js";
import { TOPICS } from "../src/config.js";

test("only explicitly listed, case-sensitive staff usernames have ping UI permission", () => {
  assert.equal(isStaff("agir-staff"), true);
  assert.equal(isStaff(" agir-staff "), true);
  for (const username of ["agir-guest", "guest", "staff", "AGIR-STAFF", "agir-staff-2", "", null]) {
    assert.equal(isStaff(username), false);
  }
});

test("viewers receive buoys but cannot start ping requests, even with fresh GPS", () => {
  const state = new DashboardState(() => 0);
  const marks = [{ type: 0, lat: 59.3, lon: 18.1 }];
  state.ready = true;
  state.ingest(TOPICS.position, {
    fix_valid: true, latitude_deg: 59.3, longitude_deg: 18.1, marks,
  });
  assert.deepEqual(state.marks(), marks);
  assert.equal(state.canPing(), false);
  assert.throws(() => state.beginPing(0, "guest-request"), /Only Staff/);
  assert.equal(state.pingPending, null);
  state.pingAllowed = true;
  assert.equal(state.canPing(), true);
  state.beginPing(0, "staff-request");
  state.reset();
  state.ready = true;
  state.ingest(TOPICS.position, {
    fix_valid: true, latitude_deg: 59.3, longitude_deg: 18.1, marks,
  });
  assert.equal(state.pingAllowed, false);
  assert.equal(state.pingPending, null);
  assert.equal(state.canPing(), false);
});
