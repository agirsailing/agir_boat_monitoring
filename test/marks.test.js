import test from "node:test";
import assert from "node:assert/strict";
import { DashboardState } from "../state.js";
import { TOPICS, SETTINGS } from "../config.js";
import { MARK_NAMES, validMark, validMarks } from "../marks.js";
import { BoatMap } from "../map.js";

const mark = (type = 0, lat = 59.123456789, lon = 18.123456789) => ({ type, lat, lon });
const position = marks => ({ fix_valid: true, latitude_deg: 59, longitude_deg: 18, marks });

test("mark codes and coordinate validation preserve precision and reject malformed states", () => {
  assert.deepEqual(MARK_NAMES, { 0: "Committee", 1: "Pin", 2: "Windward" });
  assert.ok(validMarks([mark(0), mark(1), mark(2)]));
  assert.ok(validMark(mark(0, 0, 0)));
  for (const invalid of [null, {}, mark(3), mark(true), mark("1"), mark(0, 91), mark(0, 0, NaN)]) {
    assert.ok(!validMark(invalid));
  }
  assert.ok(!validMarks([mark(1), mark(1)]));
});

test("ping needs a connected new gateway and fresh valid GPS, independently of recording", () => {
  let now = 0;
  const state = new DashboardState(() => now);
  state.ingest(TOPICS.position, position([]));
  assert.equal(state.canPing(), false);
  state.ready = true;
  state.pingAllowed = true;
  assert.equal(state.canPing(), true);
  assert.deepEqual(state.beginPing(2, "request-1"), { type: 2, requestId: "request-1" });
  assert.equal(state.canPing(), false);
  assert.throws(() => state.beginPing(1, "other"));
  assert.equal(state.pingResponse(TOPICS.startResponse, {
    requestId: "request-1", success: true, error_message: "", mark: mark(2),
  }), null);
  assert.equal(state.pingResponse(TOPICS.pingResponse, {
    requestId: "request-1", success: true, error_message: "", mark: mark(0),
  }), null);
  const reply = { requestId: "request-1", success: true, error_message: "", mark: mark(2) };
  assert.equal(state.pingResponse(TOPICS.pingResponse, reply), reply);
  assert.deepEqual(state.marks(), []); // No optimistic position from the reply.
  state.ingest(TOPICS.position, position([mark(2)]));
  assert.deepEqual(state.marks(), [mark(2)]);
  now = SETTINGS.dataTimeoutMs;
  assert.equal(state.canPing(), false);
  assert.deepEqual(state.marks(), []);
  state.ingest(TOPICS.position, position(undefined)); // Older boat deployment.
  assert.equal(state.canPing(), false);
});

test("buoys survive a fresh map with invalid GPS, but cannot be pinged; timeout/reset clear pending", () => {
  let now = 0;
  const state = new DashboardState(() => now);
  state.ready = true;
  state.pingAllowed = true;
  state.ingest(TOPICS.position, position([mark()]));
  state.beginPing(1, "request-1");
  now = SETTINGS.commandTimeoutMs;
  assert.ok(state.expirePing());
  assert.equal(state.pingPending, null);
  state.ingest(TOPICS.position, { ...position([mark()]), fix_valid: false });
  assert.deepEqual(state.marks(), [mark()]);
  assert.equal(state.canPing(), false);
  state.reset();
  assert.deepEqual(state.marks(), []);
  assert.equal(state.pingPending, null);
});

test("map creates one marker per type, moves replacements, and reset track leaves buoys intact", () => {
  const previous = globalThis.L;
  const created = [];
  globalThis.L = {
    divIcon: options => options,
    marker: (latlon, options) => {
      const item = { latlon, options, addTo() { return this; },
        bindTooltip(label) { this.label = label; return this; },
        setLatLng(value) { this.latlon = value; }, remove() { this.removed = true; } };
      created.push(item);
      return item;
    },
  };
  try {
    const view = new BoatMap({}, {}, {}, { addEventListener() {} });
    view.updateMarks([mark(0)]); // Before the map is first opened.
    assert.equal(created.length, 0);
    view.map = {};
    view.updateMarks(view.marks);
    view.updateMarks([mark(0, 60), mark(1), mark(2)]);
    assert.equal(created.length, 3);
    assert.deepEqual(created.map(item => item.label), ["Committee", "Pin", "Windward"]);
    assert.deepEqual(created[0].latlon, [60, 18.123456789]);
    view.resetTrack();
    assert.equal(view.buoyMarkers.size, 3);
    view.update({ latitude: null, longitude: null });
    assert.equal(view.buoyMarkers.size, 3);
    view.updateMarks([]); // Expired boat state or a new empty course.
    assert.ok(created.every(item => item.removed));
    assert.equal(view.buoyMarkers.size, 0);
  } finally {
    globalThis.L = previous;
  }
});
