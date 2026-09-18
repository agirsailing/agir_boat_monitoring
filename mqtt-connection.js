import { TOPICS, SETTINGS } from "./config.js";
import { brokerUrl } from "./state.js";

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
    const client = this.library.connect(credentials.endpoint, {
      username: credentials.username,
      password: credentials.password,
      clientId: "agir_web_" + crypto.randomUUID(),
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: SETTINGS.connectTimeoutMs,
      queueQoSZero: false,
      resubscribe: false,
    });
    this.client = client;
    const current = () => this.client === client;
    const failed = () => {
      if (!current()) return;
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
      client.subscribe(topics, { qos: 1 }, (error, granted) => {
        if (!current()) return;
        if (error || !granted || granted.length !== topics.length ||
            granted.some(item => item.qos > 2)) {
          failed();
          return;
        }
        this.ready = true;
        this.onStatus("connected");
      });
    });
    client.on("message", (topic, payload, packet) => {
      if (!current() || packet.retain || payload.length > SETTINGS.maxPayloadBytes) return;
      try {
        const data = JSON.parse(payload.toString());
        this.onMessage(topic, data);
      } catch {
        // Ignore malformed input. Do not include received content in logs or HTML.
      }
    });
    client.on("error", failed);
    client.on("close", failed);
    client.on("offline", failed);
  }

  publish(action, payload, onError) {
    const client = this.client;
    if (!this.ready || !client?.connected || !["start", "stop"].includes(action)) {
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
