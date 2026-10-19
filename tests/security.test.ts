import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { io, type Socket } from "socket.io-client";
import { Socket as EngineClient } from "engine.io-client";
import { Engine } from "../server/engine.js";
import { loadBank } from "../server/bank.js";
import { createApp } from "../server/app.js";
import type { Ack } from "../shared/schema.js";

const disconnected = (socket: Socket) =>
  new Promise<void>((resolve) => socket.once("disconnect", () => resolve()));
const command = (type: string, payload = {}, extra = {}) => ({
  type,
  payload,
  requestId: randomUUID(),
  roundId: null,
  ...extra,
});

test("sync is requester-only, bounded to one snapshot/second and cannot renew room TTL", () => {
  let now = 0;
  const engine = new Engine(loadBank(), { now: () => now, ttlMs: 2000 });
  const created = engine.execute("a", command("create", { name: "A" }));
  assert(created.ok && created.session);
  assert(
    engine.execute(
      "b",
      command("join", { name: "B", code: created.session.code }),
    ).ok,
  );
  const sent: string[] = [];
  engine.onChange = (id) => sent.push(id);
  for (let i = 0; i < 25; i++) assert(engine.execute("a", command("sync")).ok);
  assert.deepEqual(sent, ["a"]);
  now = 999;
  assert(engine.execute("a", command("sync")).ok);
  assert.equal(sent.length, 1);
  now = 1000;
  assert(engine.execute("a", command("sync")).ok);
  assert.deepEqual(sent, ["a", "a"]);
  now = 2001;
  engine.tick();
  assert.equal(engine.rooms.size, 0);
});

test("validated ready/settings/custom no-ops keep readiness, phase and idle TTL unchanged", () => {
  let now = 0;
  const engine = new Engine(loadBank(), { now: () => now, ttlMs: 1000 });
  const created = engine.execute("a", command("create", { name: "A" }));
  assert(created.ok && created.session);
  const room = engine.rooms.get(created.session.code)!;
  const run = (type: string, payload: object) =>
    engine.execute("a", command(type, payload, { phaseId: room.phaseId }));
  assert(run("ready", { ready: true }).ok);
  let broadcasts = 0;
  engine.onChange = () => broadcasts++;
  const phase = room.phaseId;
  now = 900;
  for (const [type, payload] of [
    ["ready", { ready: true }],
    ["settings", { settings: room.settings }],
    ["custom", { questions: [] }],
  ] as const)
    assert(run(type, payload).ok);
  assert.equal(broadcasts, 0);
  assert.equal(room.phaseId, phase);
  assert.equal(room.players[0].ready, true);
  assert.equal(room.lastActivity, 0);
  assert.equal(run("settings", { settings: {} }).ok, false);
  now = 1001;
  engine.tick();
  assert.equal(engine.rooms.size, 0);
});

async function fixture(
  t: TestContext,
  options: Parameters<typeof createApp>[0] = {},
) {
  const app = createApp({ tickMs: 100000, ...options });
  app.http.listen(0, "127.0.0.1");
  await once(app.http, "listening");
  const address = app.http.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const clients: Socket[] = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await app.close();
  });
  async function client() {
    const socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { Origin: "http://localhost:5173" },
      autoConnect: false,
      reconnection: false,
      forceNew: true,
    });
    clients.push(socket);
    const ready = new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    socket.connect();
    await ready;
    return socket;
  }
  const send = async (socket: Socket, type: string, payload = {}) =>
    (await socket
      .timeout(1000)
      .emitWithAck("command", command(type, payload))) as Ack;
  return { app, url, client, send };
}

test("raw Engine.IO and unjoined sockets expire despite chatter; admitted players remain", async (t) => {
  let now = 0;
  const { app, url, client, send } = await fixture(t, {
    now: () => now,
    joinTimeoutMs: 100,
  });
  const raw = new EngineClient(url, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173" },
  });
  t.after(() => raw.close());
  await new Promise<void>((resolve) => raw.once("open", () => resolve()));
  const idle = await client();
  const member = await client();
  assert((await send(member, "create", { name: "A" })).ok);
  idle.emit("unknown-event");
  const closed = [
    new Promise<void>((resolve) => raw.once("close", () => resolve())),
    disconnected(idle),
  ];
  now = 100;
  app.sweep();
  await Promise.all(closed);
  assert(member.connected);
  assert.equal(app.io.engine.clientsCount, 1);
});

test("global transport admission rejects excess connections and recovers slots", async (t) => {
  const { app, url, client } = await fixture(t, { maxTransports: 2 });
  const a = await client(),
    b = await client();
  const excess = io(url, {
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173" },
    autoConnect: false,
    reconnection: false,
  });
  t.after(() => excess.disconnect());
  const denied = new Promise<void>((resolve) =>
    excess.once("connect_error", () => resolve()),
  );
  excess.connect();
  await denied;
  assert.equal(app.io.engine.clientsCount, 2);
  const removed = new Promise<void>((resolve) =>
    app.io.sockets.sockets.get(a.id!)!.once("disconnect", () => resolve()),
  );
  a.disconnect();
  await removed;
  for (let i = 0; i < 100 && Number(app.io.engine.clientsCount) !== 1; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(app.io.engine.clientsCount, 1);
  const c = await client();
  assert(c.connected && b.connected);
  assert.equal(app.io.engine.clientsCount, 2);
});

test("unknown/no-ACK floods and sustained command-limit violations close the entire transport", async (t) => {
  let now = 0;
  const { app, client, send } = await fixture(t, { now: () => now });
  const flood = await client();
  const closed = disconnected(flood);
  for (let i = 0; i < 101; i++) flood.emit("unrecognized");
  await closed;
  const member = await client();
  assert((await send(member, "create", { name: "A" })).ok);
  const memberClosed = disconnected(member);
  for (let i = 0; i < 40; i++)
    member.emit("command", command("sync"), () => {});
  await memberClosed;
  assert.equal(app.io.engine.clientsCount, 0);
  assert.equal(app.engine.connections.size, 0);
});

test("opening budget survives reconnects and renews after a minute", async (t) => {
  let now = 0;
  const { app, url, client } = await fixture(t, { now: () => now });
  for (let i = 0; i < 80; i++) {
    const socket = await client();
    const removed = new Promise<void>((resolve) =>
      app.io.sockets.sockets
        .get(socket.id!)!
        .once("disconnect", () => resolve()),
    );
    socket.disconnect();
    await removed;
  }
  const excess = io(url, {
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173" },
    autoConnect: false,
    reconnection: false,
  });
  t.after(() => excess.disconnect());
  const denied = new Promise<void>((resolve) =>
    excess.once("connect_error", () => resolve()),
  );
  excess.connect();
  await denied;
  now = 60000;
  app.sweep();
  assert((await client()).connected);
});
