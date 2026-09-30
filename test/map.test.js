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
    view.show(true);
    assert.deepEqual(map.center, STOCKHOLM);
    assert.equal(map.zoom, 13);
    view.update({ latitude: 59.3, longitude: 18.1 });
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
    view.show(true);
    assert.equal(mapsCreated, 1);
    view.update({ latitude: null, longitude: null });
    assert.equal(view.marker, null);
    assert.equal(marker.removed, true);
    assert.equal(view.bearing, null);
  } finally {
    globalThis.L = previousL;
  }
});
