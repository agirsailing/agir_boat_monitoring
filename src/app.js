import { TOPICS } from "./config.js";
import { DashboardState } from "./core/state.js";
import { BrokerConnection } from "./services/mqtt-connection.js";
import { BoatMap } from "./ui/map.js";
import { mountPages, showPage } from "./ui/pages.js";
import { renderDashboard } from "./ui/dashboard.js";
import { createRenderScheduler, LiveDiagnostics } from "./core/live-runtime.js";
import { MARK_NAMES } from "./core/marks.js";

async function startApp() {
  await mountPages(document.getElementById("page-content"));
  const el = id => document.getElementById(id);
  const state = new DashboardState();
  const diagnostics = new LiveDiagnostics();
  // On-demand diagnostic snapshot; no periodic logging or stored payloads.
  window.agirDiagnostics = () => ({
    ...diagnostics.snapshot(),
    mqtt: connection.diagnostics(),
    visibility: document.visibilityState,
    trackPoints: boatMap.trackSegments.reduce((count, segment) => count + segment.points.length, 0),
  });
  const boatMap = new BoatMap(el("boat-map"), el("map-status"), el("map-error"), el("follow-boat"));
  let lastMapSample;
  let lastMapVisible;
  let lastHash;
  let page;
  const render = createRenderScheduler(() => {
    const start = performance.now();
    paint();
    diagnostics.rendered(performance.now() - start);
  }, () => {
    diagnostics.renderErrors++;
    console.error("Dashboard rendering failed; check agirDiagnostics().renderErrors.");
  });
  el("reset-track").addEventListener("click", () => {
    boatMap.resetTrack(state.values());
    render();
  });
  el("draw-track").addEventListener("click", () => {
    if (boatMap.startLine) {
      boatMap.clearStartLine();
    } else {
      // Refresh marks at click time so expired positions cannot be drawn.
      boatMap.updateMarks(state.marks());
      if (state.canDraw()) boatMap.drawStartLine();
    }
    render();
  });
  let demo = false;
  let demoTimer = null;
  let linkStatus = "disconnected";
  const setText = (id, value) => { el(id).textContent = value; };
  const feedback = text => setText("command-status", text);
  const pingFeedback = text => setText("ping-status", text);
  const connectionError = text => {
    setText("connection-error", text);
    el("connection-error").hidden = !text;
  };

  const connection = new BrokerConnection(status => {
    linkStatus = status;
    if (status !== "connected") {
      if (state.pending) feedback("Connection lost. Command outcome unknown; check the next boat state.");
      pingFeedback(state.pingPending
        ? "Connection lost. Ping outcome unknown; check the map after reconnecting."
        : "Connect and wait for a fresh GPS fix to ping a buoy.");
      state.reset();
      boatMap.reset();
      boatMap.updateMarks([]);
    } else {
      state.ready = true;
      state.pingAllowed = connection.canPing;
      feedback("Connected. Waiting for the boat's recording state.");
      pingFeedback(state.pingAllowed
        ? "Select a buoy type and ping when the boat is at that position."
        : "View only: you can see saved buoys. Only Staff can ping them.");
    }
    render();
  }, (topic, data, payloadBytes) => {
    if (topic === TOPICS.telemetry) diagnostics.receive(data, payloadBytes);
    const pingResponse = state.pingResponse(topic, data);
    if (pingResponse) {
      pingFeedback(pingResponse.success
        ? `${MARK_NAMES[pingResponse.mark.type]} saved by the boat. The map updates automatically.`
        : "Ping not confirmed: " + pingResponse.error_message);
      render();
      return;
    }
    const response = state.response(topic, data);
    if (response) {
      feedback(response.success
        ? "Boat confirmed the command. Waiting for updated recording state."
        : "Boat rejected the command: " + response.error_message);
    } else {
      state.ingest(topic, data);
    }
    render();
  });

  function paint() {
    const values = state.values();
    renderDashboard(state, demo);
    const names = { disconnected: "Disconnected", connecting: "Connecting…",
      connected: "Broker connected", reconnecting: "Retrying connection…" };
    setText("connection-status", demo ? "Demo mode" : names[linkStatus]);
    el("connection-status").dataset.tone = linkStatus === "connected" && !demo ? "good" : "";
    const active = linkStatus !== "disconnected";
    for (const id of ["connect", "broker", "username", "password"]) {
      if (el(id)) el(id).disabled = active;
    }
    if (el("disconnect")) el("disconnect").disabled = !active;
    if (el("demo-banner")) el("demo-banner").hidden = !demo;
    setText("demo", demo ? "Exit demo" : "Explore demo");

    // Toggle pages
    const isLogged = active || demo;
    if (el("login-overlay")) el("login-overlay").hidden = isLogged;
    if (el("app-content")) el("app-content").hidden = !isLogged;
    if (location.hash !== lastHash) {
      page = showPage(location.hash);
      lastHash = location.hash;
    }
    boatMap.show(isLogged && page === "map");
    el("ping-buoy").disabled = demo || !state.canPing();
    el("buoy-type").disabled = demo || !state.pingAllowed || !!state.pingPending;
    el("ping-buoy").title = demo ? "Ping is unavailable in demo mode"
      : !state.pingAllowed ? "Only Staff can ping buoys"
      : "Save the boat's current GPS position as the selected buoy";
    el("ping-buoy").textContent = state.pingPending ? "Pinging…" : "Ping";
    const mapSample = state.fresh("position");
    // Telemetry and recording packets do not require another GPS/map update.
    if (mapSample !== lastMapSample || boatMap.visible !== lastMapVisible) {
      boatMap.update(values);
      boatMap.updateMarks(state.marks());
      lastMapSample = mapSample;
      lastMapVisible = boatMap.visible;
    }

    const hasStartLine = !!boatMap.startLine;
    const canDraw = state.canDraw();
    el("draw-track").textContent = hasStartLine ? "Clear line" : "Draw";
    el("draw-track").disabled = !hasStartLine && !canDraw;
    el("draw-track").title = hasStartLine ? "Clear only the start line"
      : canDraw ? "Draw the start line between Committee and Pin"
      : "Committee and Pin are required";

    if (isLogged && el("current-user")) {
      setText("current-user", demo ? "Demo user" : el("username").value);
    }
  }

  function endDemo() {
    clearInterval(demoTimer);
    demoTimer = null;
    demo = false;
    state.reset();
    boatMap.reset({ clearTrack: true });
    boatMap.updateMarks([]);
  }

  el("connect-form").addEventListener("submit", event => {
    event.preventDefault();
    connectionError("");
    endDemo();
    try {
      connection.connect(el("broker").value, el("username").value, el("password").value);
    } catch (error) {
      connection.disconnect();
      connectionError(error.message);
    }
    render();
  });

  el("disconnect").addEventListener("click", () => {
    connection.disconnect();
    feedback("Disconnected. No recording commands will be sent.");
  });

  function command(action) {
    if (demo) return;
    try {
      const payload = state.begin(action, crypto.randomUUID());
      feedback("Request sent. Waiting for confirmation from the boat…");
      connection.publish(action, payload, () => {
        state.pending = null;
        delete state.samples.recording;
        feedback("Command delivery failed. Outcome unknown; wait for the boat state.");
        render();
      });
    } catch (error) {
      state.pending = null;
      feedback(error.message);
    }
    render();
  }
  el("start").addEventListener("click", () => command("start"));
  el("stop").addEventListener("click", () => command("stop"));

  el("ping-buoy").addEventListener("click", () => {
    if (demo || state.pingPending) return;
    const requestId = crypto.randomUUID();
    try {
      const payload = state.beginPing(Number(el("buoy-type").value), requestId);
      pingFeedback("Ping sent. Waiting for confirmation from the boat…");
      connection.publish("ping", payload, () => {
        if (state.pingPending?.requestId !== requestId) return;
        state.pingPending = null;
        pingFeedback("Ping delivery failed. Outcome unknown; check the map before retrying.");
        render();
      });
    } catch (error) {
      if (state.pingPending?.requestId === requestId) state.pingPending = null;
      pingFeedback(error.message);
    }
    render();
  });

  el("demo").addEventListener("click", () => {
    if (demo) {
      endDemo();
      feedback("Connect and wait for the boat's recording state.");
    } else {
      connection.disconnect();
      connectionError("");
      demo = true;
      boatMap.reset({ clearTrack: true });
      const tick = () => {
        const wave = Math.sin(performance.now() / 3000);
        const course = performance.now() / 60000;
        const stamp = { sec: Math.floor(Date.now() / 1000), nanosec: 0 };
        state.ingest(TOPICS.telemetry, {
          header: { stamp }, attitude_valid: true, roll_deg: 12 + wave,
          pitch_deg: 1.4 + wave * .2, yaw_deg: 32 + wave * 2,
          height_valid: true, height_m: .48 + wave * .02,
          ultrasonic_left_valid: true, ultrasonic_left_m: .62 + wave * .04,
          ultrasonic_right_valid: true, ultrasonic_right_m: .58 - wave * .03,
          battery_valid: true, battery_low: false, battery_voltage_v: 12.4,
          sog_valid: true, sog_mps: 6.2 + wave * .3,
        });
        state.ingest(TOPICS.position, {
          header: { stamp }, gps_stamp: stamp, fix_valid: true,
          latitude_deg: 59.3293 + .002 * Math.sin(course),
          longitude_deg: 18.0786 + .004 * Math.cos(course), sog_mps: 6.2 + wave * .3,
        });
        render();
      };
      feedback("Demo only. Connect to your broker to control real recordings.");
      tick();
      demoTimer = setInterval(tick, 500);
    }
    render();
  });

  el("login-demo").addEventListener("click", () => el("demo").click());
  window.addEventListener("hashchange", render);

  setInterval(() => {
    diagnostics.tick(250);
    if (state.expire()) feedback("No reply received. Outcome unknown; check the next boat state before retrying.");
    if (state.expirePing()) pingFeedback("No ping reply received. Outcome unknown; check the map before retrying.");
    render();
  }, 250);

  window.addEventListener("pagehide", () => {
    endDemo();
    connection.disconnect();
    render.cancel();
  });
  render();
}

startApp().catch(error => {
  const notice = document.getElementById("connection-error");
  notice.textContent = "The app could not load. Reload the page and check your connection.";
  notice.hidden = false;
  document.getElementById("connect").disabled = true;
  document.getElementById("login-demo").disabled = true;
  console.error("Dashboard initialization failed", error);
});
