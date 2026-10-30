import { TOPICS, SETTINGS } from "./config.js";
import { brokerUrl } from "./state.js";
import { isStaff } from "./permissions.js";

// Each reconnect creates a fresh MQTT session: never replay a queued recording command.
export class BrokerConnection {
  constructor(onStatus, onMessage, mqttLibrary = globalThis.mqtt) {
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.library = mqttLibrary;
    this.client = null;
    this.credentials = null;
    this.retry = null;
    this.ready = false;
    this.successfulConnections = 0;
    this.lastFailure = null;
    this.connectionId = null;
  }

  diagnostics() {
    return { clientId: this.connectionId, ready: this.ready,
      successfulConnections: this.successfulConnections,
      lastFailure: this.lastFailure && { ...this.lastFailure } };
  }

  get canPing() {
    return this.ready && isStaff(this.credentials?.username);
  }

  connect(url, username, password) {
    const endpoint = brokerUrl(url);
    if (!username.trim() || !password) throw new Error("Enter your MQTT username and password.");
    this.library ??= globalThis.mqtt;
    if (!this.library) throw new Error("MQTT library unavailable. Check your connection and reload the page.");
    this.disconnect();
    this.credentials = { endpoint, username: username.trim(), password };
    this.open();
  }

  open() {
    const credentials = this.credentials;
    if (!credentials) return;
    this.onStatus("connecting");
    this.connectionId = "agir_web_" + crypto.randomUUID();
    const client = this.library.connect(credentials.endpoint, {
      username: credentials.username,
      password: credentials.password,
      clientId: this.connectionId,
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: SETTINGS.connectTimeoutMs,
      queueQoSZero: false,
      resubscribe: false,
    });
    this.client = client;
    const current = () => this.client === client;
    const failed = (event, error) => {
      if (!current()) return;
      // Retain only bounded diagnostic metadata, never broker URLs or credentials.
      const code = error?.code;
      this.lastFailure = {
        at: new Date().toISOString(), clientId: client.options.clientId, event,
        code: typeof code === "number" ? code :
          typeof code === "string" && /^[A-Za-z0-9_]{1,48}$/.test(code) ? code : null,
        keepaliveTimeout: /keepalive|ping timeout/i.test(error?.message || ""),
      };
      this.client = null;
      this.ready = false;
      client.end(true);
      this.onStatus("reconnecting");
      this.retry = setTimeout(() => this.open(), SETTINGS.reconnectMs);
    };
    client.on("connect", () => {
      if (!current()) return;
      const topics = [TOPICS.telemetry, TOPICS.position, TOPICS.recording,
        TOPICS.startResponse, TOPICS.stopResponse];
      if (isStaff(credentials.username)) topics.push(TOPICS.pingResponse);
      client.subscribe(topics, { qos: 1 }, (error, granted) => {
        if (!current()) return;
        if (error || !granted || granted.length !== topics.length ||
            granted.some(item => item.qos > 2)) {
          failed("subscription_rejected", error);
          return;
        }
        this.ready = true;
        this.successfulConnections++;
        this.onStatus("connected");
      });
    });
    client.on("message", (topic, payload, packet) => {
      if (!current() || packet.retain || payload.length > SETTINGS.maxPayloadBytes) return;
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        // Only parsing failures are malformed input, not application errors.
        return;
      }
      try {
        this.onMessage(topic, data, payload.length);
      } catch {
        // Keep MQTT processing alive and surface the error without logging payloads.
        console.error("MQTT application callback failed.");
      }
    });
    client.on("error", error => failed("error", error));
    client.on("close", () => failed("close"));
    client.on("offline", () => failed("offline"));
  }

  publish(action, payload, onError) {
    const client = this.client;
    if (action === "ping" && !this.canPing) {
      throw new Error("Only Staff can ping buoys.");
    }
    if (!this.ready || !client?.connected || !["start", "stop", "ping"].includes(action)) {
      throw new Error("The broker is not connected.");
    }
    client.publish(TOPICS[action], JSON.stringify(payload), { qos: 1, retain: false }, error => {
      if (error && this.client === client) onError();
    });
  }

  disconnect() {
    clearTimeout(this.retry);
    this.retry = null;
    this.credentials = null;
    this.ready = false;
    const client = this.client;
    this.client = null;
    if (client) {
      client.end(true);
      // Drop our references to credentials; no browser storage is used.
      client.options.username = undefined;
      client.options.password = undefined;
    }
    this.onStatus("disconnected");
  }
}
