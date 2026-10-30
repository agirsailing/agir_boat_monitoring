import { finite } from "../core/state.js";
import { MARK_NAMES, validMarks } from "../core/marks.js";

export const STOCKHOLM = [59.3293, 18.0686];

// Great-circle initial bearing, clockwise from north. Ignore sub-metre jitter.
export function movementBearing(from, to) {
  const rad = degrees => degrees * Math.PI / 180;
  const [a, b] = [rad(from[0]), rad(to[0])];
  const delta = rad(to[1] - from[1]);
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(delta / 2) ** 2;
  if (6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) < 1) return null;
  return (Math.atan2(Math.sin(delta) * Math.cos(b),
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta)) * 180 / Math.PI + 360) % 360;
}

export class BoatMap {
  constructor(container, status, error, followButton) {
    Object.assign(this, { container, status, error, followButton });
    this.follow = true;
    this.map = null;
    this.marker = null;
    this.previous = null;
    this.bearing = null;
    this.visible = false;
    this.trackSegments = [];
    this.activeTrack = null;
    this.marks = [];
    this.buoyMarkers = new Map();
    this.startLine = null;
    followButton.addEventListener("click", () => {
      this.setFollow(!this.follow);
      if (this.follow && this.marker) this.map.panTo(this.marker.getLatLng());
    });
  }

  setFollow(value) {
    this.follow = value;
    this.followButton.setAttribute("aria-pressed", String(value));
    this.followButton.textContent = `Follow boat: ${value ? "on" : "off"}`;
  }

  show(visible) {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) return;
    const L = globalThis.L;
    if (!L) {
      this.error.textContent = "Map could not load. Check your connection and reload the page.";
      this.error.hidden = false;
      return;
    }
    if (!this.map) {
      this.map = L.map(this.container).setView(STOCKHOLM, 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("tileerror", () => {
        this.error.textContent = "Some map tiles could not load. GPS updates remain active.";
        this.error.hidden = false;
      }).addTo(this.map);
      this.map.on("dragstart", () => this.setFollow(false));
      for (const segment of this.trackSegments) this.drawTrackSegment(segment);
      this.updateMarks(this.marks);
    }
    this.map.invalidateSize({ pan: false });
  }

  drawTrackSegment(segment) {
    segment.layer = globalThis.L.polyline(segment.points, {
      color: "#126c69", weight: 3, opacity: 0.8, interactive: false,
    }).addTo(this.map);
  }

  updateMarks(marks) {
    this.marks = validMarks(marks) ? marks : [];
    if (!this.map) return;
    const types = new Set(this.marks.map(mark => mark.type));
    for (const [type, marker] of this.buoyMarkers) {
      if (!types.has(type)) {
        marker.remove();
        this.buoyMarkers.delete(type);
      }
    }
    for (const mark of this.marks) {
      const position = [mark.lat, mark.lon];
      const existing = this.buoyMarkers.get(mark.type);
      if (existing) {
        existing.setLatLng(position);
      } else {
        const label = MARK_NAMES[mark.type];
        const marker = globalThis.L.marker(position, {
          title: label,
          icon: globalThis.L.divIcon({
            className: `buoy-marker buoy-${mark.type}`, iconSize: [28, 28], iconAnchor: [14, 14],
            html: `<span aria-hidden="true">${label[0]}</span>`,
          }),
        }).bindTooltip(label, { permanent: true, direction: "top" }).addTo(this.map);
        this.buoyMarkers.set(mark.type, marker);
      }
    }
    if (this.startLine) this.drawStartLine();
  }

  drawStartLine() {
    const committee = this.marks.find(mark => mark.type === 0);
    const pin = this.marks.find(mark => mark.type === 1);
    if (!this.map || !committee || !pin) {
      this.clearStartLine();
      return false;
    }
    const points = [[committee.lat, committee.lon], [pin.lat, pin.lon]];
    if (this.startLine) {
      this.startLine.setLatLngs(points);
    } else {
      this.startLine = globalThis.L.polyline(points, {
        color: "#d97706", weight: 4, opacity: 0.9, dashArray: "10 6",
      }).bindTooltip("Start line · Committee — Pin").addTo(this.map);
    }
    return true;
  }

  clearStartLine() {
    this.startLine?.remove();
    this.startLine = null;
  }

  recordPosition(position) {
    if (!this.activeTrack) {
      this.activeTrack = { points: [position], layer: null };
      this.trackSegments.push(this.activeTrack);
      if (this.map) this.drawTrackSegment(this.activeTrack);
      return;
    }
    const last = this.activeTrack.points.at(-1);
    // Re-rendering the same GPS sample must not grow the track.
    if (last[0] === position[0] && last[1] === position[1]) return;
    this.activeTrack.points.push(position);
    this.activeTrack.layer?.addLatLng(position);
  }

  resetTrack({ latitude, longitude } = {}) {
    for (const segment of this.trackSegments) segment.layer?.remove();
    this.trackSegments = [];
    this.activeTrack = null;
    // Start at the fresh fix supplied by the state, never a cached/stale marker.
    if (finite(latitude) && finite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      this.recordPosition([latitude, longitude]);
    }
  }

  reset({ clearTrack = false } = {}) {
    if (this.marker) this.marker.remove();
    this.marker = null;
    this.previous = null;
    this.bearing = null;
    // Preserve previous segments across GPS gaps without inventing a route
    // between the last known position and the first recovered fix.
    this.activeTrack = null;
    if (clearTrack) this.resetTrack();
  }

  update(values) {
    const { latitude, longitude } = values;
    if (!finite(latitude) || !finite(longitude)) {
      this.reset();
      this.status.textContent = "Waiting for a valid GPS fix";
      return;
    }
    const position = [latitude, longitude];
    this.recordPosition(position);
    if (!this.map) return;
    const course = this.previous ? movementBearing(this.previous, position) : null;
    if (course !== null) this.bearing = course;
    if (!this.previous || course !== null) this.previous = position;
    if (!this.marker) {
      this.marker = globalThis.L.marker(position, {
        title: "Boat GPS position",
        icon: globalThis.L.divIcon({
          className: "boat-marker", iconSize: [40, 40], iconAnchor: [20, 20],
          html: '<svg class="boat-arrow" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 34 35 20 28 6 35Z"/></svg>',
        }),
      }).addTo(this.map);
    } else {
      this.marker.setLatLng(position);
    }
    this.marker.getElement().querySelector(".boat-arrow").style.transform = `rotate(${this.bearing ?? 0}deg)`;
    this.status.textContent = `${latitude.toFixed(6)}°, ${longitude.toFixed(6)}° · ${this.bearing === null ? "Direction unavailable" : `GPS course ${this.bearing.toFixed(0)}°`}`;
    if (this.follow && this.visible) this.map.panTo(position, { animate: false });
  }
}
