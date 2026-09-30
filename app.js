import { TOPICS } from "./config.js";
import { DashboardState } from "./state.js";
import { BrokerConnection } from "./mqtt-connection.js";
import { BoatMap } from "./map.js";
import { mountPages, showPage } from "./pages.js";
import { renderDashboard } from "./dashboard.js";

async function startApp() {
  await mountPages(document.getElementById("page-content"));
  const el = id => document.getElementById(id);
  const state = new DashboardState();
  const boatMap = new BoatMap(el("boat-map"), el("map-status"), el("map-error"), el("follow-boat"));
  let demo = false;
  let demoTimer = null;
  let linkStatus = "disconnected";
  const setText = (id, value) => { el(id).textContent = value; };
  const feedback = text => setText("command-status", text);
  const connectionError = text => {
    setText("connection-error", text);
    el("connection-error").hidden = !text;
  };

  const connection = new BrokerConnection(status => {
    linkStatus = status;
    if (status !== "connected") {
      if (state.pending) feedback("Connection lost. Command outcome unknown; check the next boat state.");
      state.reset();
      boatMap.reset();
    } else {
      state.ready = true;
      feedback("Connected. Waiting for the boat's recording state.");
    }
    render();
  }, (topic, data) => {
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

  function render() {
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
    const page = showPage(location.hash);
    boatMap.show(isLogged && page === "map");
    boatMap.update(values);

    if (isLogged && el("current-user")) {
      setText("current-user", demo ? "Demo user" : el("username").value);
    }
  }

  function endDemo() {
    clearInterval(demoTimer);
    demoTimer = null;
    demo = false;
    state.reset();
    boatMap.reset();
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

  el("demo").addEventListener("click", () => {
    if (demo) {
      endDemo();
      feedback("Connect and wait for the boat's recording state.");
    } else {
      connection.disconnect();
      connectionError("");
      demo = true;
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
          battery_valid: true, battery_low: false, sog_valid: true, sog_mps: 6.2 + wave * .3,
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
    if (state.expire()) feedback("No reply received. Outcome unknown; check the next boat state before retrying.");
    render();
  }, 250);

  window.addEventListener("pagehide", () => {
    endDemo();
    connection.disconnect();
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
