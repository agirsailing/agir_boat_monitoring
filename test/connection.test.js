import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { BrokerConnection } from "../mqtt-connection.js";
import { TOPICS } from "../config.js";

class Client extends EventEmitter {
  constructor(options) { super(); this.options = options; this.connected = true; this.sent = []; }
  subscribe(topics, options, callback) { this.subscriptions = topics; callback(null, topics.map(topic => ({ topic, qos: 1 }))); }
  publish(...args) { this.sent.push(args); }
  end(force) { this.ended = force; this.connected = false; }
}
function fixture(username = "agir-staff") {
  const statuses = [], messages = [], clients = [];
  const library = { connect: (url, options) => {
    const client = new Client(options); clients.push(client); return client;
  }};
  const connection = new BrokerConnection(s => statuses.push(s), (...m) => messages.push(m), library);
  connection.connect("wss://example.org/mqtt", username, "placeholder");
  return { connection, client: clients[0], statuses, messages };
}
test("subscribes to data and responses; recording commands are never retained", () => {
  const { connection, client } = fixture();
  client.emit("connect");
  assert.equal(connection.ready, true);
  assert.equal(client.subscriptions.length, 6);
  assert.equal(client.options.clean, true);
  assert.equal(client.options.reconnectPeriod, 0);
  connection.publish("start", { requestId: "one" }, () => {});
  assert.deepEqual(client.sent[0].slice(0, 3), [TOPICS.start, '{"requestId":"one"}', { qos: 1, retain: false }]);
  assert.ok(client.subscriptions.includes(TOPICS.pingResponse));
  connection.publish("ping", { requestId: "ping-1", type: 0 }, () => {});
  assert.deepEqual(client.sent[1].slice(0, 3), [TOPICS.ping,
    '{"requestId":"ping-1","type":0}', { qos: 1, retain: false }]);
  connection.disconnect();
  assert.equal(connection.credentials, null);
  assert.equal(client.options.password, undefined);
  assert.throws(() => connection.publish("start", {}, () => {}));
});
test("ignores retained/malformed packets and closes the old session after an outage", () => {
  const { connection, client, messages, statuses } = fixture();
  client.emit("connect");
  client.emit("message", TOPICS.recording, Buffer.from("{}"), { retain: true });
  client.emit("message", TOPICS.recording, Buffer.from("{"), { retain: false });
  client.emit("message", TOPICS.recording, Buffer.from('{"recording":true}'), { retain: false });
  assert.equal(messages.length, 1);
  client.emit("close");
  assert.equal(connection.ready, false);
  assert.equal(client.ended, true);
  assert.equal(statuses.at(-1), "reconnecting");
  client.emit("message", TOPICS.recording, Buffer.from("{}"), { retain: false });
  assert.equal(messages.length, 1);
  connection.disconnect();
});

test("guest and unknown accounts can receive marks but cannot publish ping directly", () => {
  for (const username of ["agir-guest", "unlisted-user"]) {
    const { connection, client, messages } = fixture(username);
    client.emit("connect");
    assert.equal(connection.ready, true);
    assert.equal(connection.canPing, false);
    assert.ok(client.subscriptions.includes(TOPICS.position));
    assert.ok(!client.subscriptions.includes(TOPICS.pingResponse));
    assert.throws(() => connection.publish("ping", { requestId: "blocked", type: 1 }, () => {}), /Only Staff/);
    assert.equal(client.sent.length, 0);
    client.emit("message", TOPICS.position, Buffer.from(JSON.stringify({
      fix_valid: true, marks: [{ type: 0, lat: 59.3, lon: 18.1 }],
    })), { retain: false });
    assert.equal(messages[0][1].marks[0].type, 0);
    connection.disconnect();
  }
});

test("staff permission follows the authenticated session, not form edits or a previous login", () => {
  const { connection, client } = fixture("agir-staff");
  assert.equal(connection.canPing, false);
  client.emit("connect");
  assert.equal(connection.canPing, true);
  connection.disconnect();
  assert.equal(connection.canPing, false);
  connection.connect("wss://example.org/mqtt", "agir-guest", "placeholder");
  connection.client.emit("connect");
  assert.equal(connection.canPing, false);
  assert.throws(() => connection.publish("ping", {}, () => {}), /Only Staff/);
  connection.disconnect();
});
test("denied subscriptions never enable commands", () => {
  const { connection, client } = fixture();
  client.subscribe = (topics, options, callback) => callback(null, [{ qos: 128 }]);
  client.emit("connect");
  assert.equal(connection.ready, false);
  connection.disconnect();
});

test("disconnect diagnostics preserve the first cause without credentials or error text", () => {
  const { connection, client } = fixture();
  client.emit("connect");
  client.emit("error", Object.assign(new Error("Keepalive timeout; private test text"), { code: "ETIMEDOUT" }));
  client.emit("close");
  const info = connection.diagnostics();
  assert.equal(info.successfulConnections, 1);
  assert.equal(info.lastFailure.event, "error");
  assert.equal(info.lastFailure.code, "ETIMEDOUT");
  assert.equal(info.lastFailure.keepaliveTimeout, true);
  assert.equal(info.lastFailure.clientId, client.options.clientId);
  assert.ok(!JSON.stringify(info).includes("private test text"));
  connection.disconnect();
});

test("application errors are reported without payloads and do not stop later messages", () => {
  const { connection, client } = fixture();
  const previousError = console.error;
  const errors = [];
  let calls = 0;
  console.error = (...args) => errors.push(args);
  connection.onMessage = (topic, data, bytes) => {
    assert.equal(bytes, 2);
    if (++calls === 1) throw new Error("payload must not appear in logs");
  };
  try {
    client.emit("message", TOPICS.telemetry, Buffer.from("{}"), { retain: false });
    client.emit("message", TOPICS.telemetry, Buffer.from("{}"), { retain: false });
    assert.equal(calls, 2);
    assert.deepEqual(errors, [["MQTT application callback failed."]]);
  } finally {
    console.error = previousError;
    connection.disconnect();
  }
});

