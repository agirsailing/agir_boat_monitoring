import test from "node:test";
import assert from "node:assert/strict";
import { BoatMap, STOCKHOLM, movementBearing } from "../map.js";

test("GPS bearing uses absolute coordinates and handles the antimeridian", () => {
  assert.equal(movementBearing([0, 0], [1, 0]), 0);
  assert.equal(movementBearing([0, 0], [0, 1]), 90);
  assert.equal(movementBearing([0, 0], [-1, 0]), 180);
  assert.equal(movementBearing([0, 0], [0, -1]), 270);
  assert.equal(movementBearing([0, 179.9], [0, -179.9]), 90);
});
test("stationary GPS and sub-metre jitter do not change course", () => {
  assert.equal(movementBearing([59.3, 18], [59.3, 18]), null);
  assert.equal(movementBearing([59.3, 18], [59.300001, 18]), null);
});

test("map starts at Stockholm, sets absolute fixes, preserves view and removes stale marker", () => {
  const previousL = globalThis.L;
  const events = {};
  const map = {
    setView(position, zoom) { this.center = position; this.zoom = zoom; return this; },
    invalidateSize() { this.resized = true; },
    on(name, fn) { events[name] = fn; },
    panTo(position) { this.center = position; },
  };
  let mapsCreated = 0;
  globalThis.L = {
    map() { mapsCreated++; return map; },
    tileLayer() { return { on() { return this; }, addTo() { return this; } }; },
    divIcon(options) { return options; },
    polyline(points) {
      return {
        points: [...points],
        addTo() { return this; },
        addLatLng(point) { this.points.push(point); },
        remove() { this.removed = true; },
      };
    },
    marker(position) {
      return {
        position, arrow: { style: {} },
        addTo() { return this; },
        setLatLng(value) { this.position = value; },
        getLatLng() { return this.position; },
        getElement() { return { querySelector: () => this.arrow }; },
        remove() { this.removed = true; },
      };
    },
  };
  const button = { addEventListener(name, fn) { this.click = fn; }, setAttribute() {} };
  try {
    const view = new BoatMap({}, {}, {}, button);
    view.update({ latitude: 59.29, longitude: 18.0 });
    view.update({ latitude: 59.3, longitude: 18.1 });
    // Samples received on the dashboard survive the map's lazy initialization.
    assert.equal(view.trackSegments[0].points.length, 2);
    view.show(true);
    assert.deepEqual(map.center, STOCKHOLM);
    assert.equal(map.zoom, 13);
    view.update({ latitude: 59.3, longitude: 18.1 });
    assert.equal(view.trackSegments[0].points.length, 2);
    assert.equal(view.trackSegments[0].layer.points.length, 2);
    const marker = view.marker;
    view.update({ latitude: 59.31, longitude: 18.2 });
    assert.equal(view.marker, marker);
    assert.deepEqual(marker.position, [59.31, 18.2]);
    assert.deepEqual(map.center, [59.31, 18.2]);
    events.dragstart();
    view.update({ latitude: 59.32, longitude: 18.3 });
    assert.deepEqual(map.center, [59.31, 18.2]);
    button.click();
    assert.deepEqual(map.center, [59.32, 18.3]);
    view.show(false);
    view.update({ latitude: 59.33, longitude: 18.4 });
    assert.deepEqual(view.trackSegments[0].layer.points, [
      [59.29, 18.0], [59.3, 18.1], [59.31, 18.2], [59.32, 18.3], [59.33, 18.4],
    ]);
    view.show(true);
    assert.equal(mapsCreated, 1);
    view.update({ latitude: null, longitude: null });
    assert.equal(view.marker, null);
    assert.equal(marker.removed, true);
    assert.equal(view.bearing, null);
    assert.equal(view.trackSegments[0].points.length, 5);
    view.update({ latitude: null, longitude: null });
    assert.equal(view.trackSegments.length, 1);
    view.update({ latitude: 59.35, longitude: 18.6 });
    assert.equal(view.trackSegments.length, 2);
    assert.deepEqual(view.trackSegments[1].points, [[59.35, 18.6]]);
    const oldLayers = view.trackSegments.map(segment => segment.layer);
    const currentMarker = view.marker;
    const currentBearing = view.bearing;
    view.setFollow(false);
    view.resetTrack({ latitude: 59.35, longitude: 18.6 });
    assert.ok(oldLayers.every(layer => layer.removed));
    assert.equal(view.marker, currentMarker);
    assert.equal(view.bearing, currentBearing);
    assert.equal(view.follow, false);
    assert.equal(view.trackSegments.length, 1);
    assert.deepEqual(view.trackSegments[0].layer.points, [[59.35, 18.6]]);
    view.update({ latitude: 59.35, longitude: 18.6 });
    view.update({ latitude: 59.36, longitude: 18.7 });
    assert.deepEqual(view.trackSegments[0].layer.points, [[59.35, 18.6], [59.36, 18.7]]);
    const layers = view.trackSegments.map(segment => segment.layer);
    view.reset({ clearTrack: true });
    assert.equal(view.trackSegments.length, 0);
    assert.ok(layers.every(layer => layer.removed));
  } finally {
    globalThis.L = previousL;
  }
});

test("reset track without a valid current fix waits for GPS, including before map initialization", () => {
  const button = { addEventListener() {}, setAttribute() {} };
  const view = new BoatMap({}, {}, {}, button);
  view.update({ latitude: 59, longitude: 18 });
  for (const fix of [
    { latitude: null, longitude: null },
    { latitude: NaN, longitude: 18 },
    { latitude: 91, longitude: 18 },
    { latitude: 59, longitude: 181 },
  ]) {
    view.resetTrack(fix);
    assert.equal(view.trackSegments.length, 0);
    assert.equal(view.activeTrack, null);
  }
  view.update({ latitude: 59.4, longitude: 18.5 });
  assert.deepEqual(view.trackSegments[0].points, [[59.4, 18.5]]);
  view.resetTrack({ latitude: 0, longitude: 0 });
  view.update({ latitude: 0, longitude: 0.01 });
  assert.deepEqual(view.trackSegments[0].points, [[0, 0], [0, 0.01]]);
});
