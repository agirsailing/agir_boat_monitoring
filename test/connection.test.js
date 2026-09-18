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
function fixture() {
  const statuses = [], messages = [], clients = [];
  const library = { connect: (url, options) => {
    const client = new Client(options); clients.push(client); return client;
  }};
  const connection = new BrokerConnection(s => statuses.push(s), (...m) => messages.push(m), library);
  connection.connect("wss://example.org/mqtt", "operator", "placeholder");
  return { connection, client: clients[0], statuses, messages };
}
test("subscribes to data and responses; recording commands are never retained", () => {
  const { connection, client } = fixture();
  client.emit("connect");
  assert.equal(connection.ready, true);
  assert.equal(client.subscriptions.length, 5);
  assert.equal(client.options.clean, true);
  assert.equal(client.options.reconnectPeriod, 0);
  connection.publish("start", { requestId: "one" }, () => {});
  assert.deepEqual(client.sent[0].slice(0, 3), [TOPICS.start, '{"requestId":"one"}', { qos: 1, retain: false }]);
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
test("denied subscriptions never enable commands", () => {
  const { connection, client } = fixture();
  client.subscribe = (topics, options, callback) => callback(null, [{ qos: 128 }]);
  client.emit("connect");
  assert.equal(connection.ready, false);
  connection.disconnect();
});

