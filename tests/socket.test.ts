import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../server/app.js";
import { DEFAULT_SETTINGS, type Snapshot, type Ack } from "../shared/schema.js";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await delay(10);
  }
  assert.fail("Timed out waiting for state");
}
test("real Socket.IO: independent clients, simultaneous answers, secret reconnect, votes, duplicate ACKs and advance", async () => {
  const app = createApp({ countdownMs: 10, tickMs: 5 });
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (app.http.address() as { port: number }).port;
  const clients: Socket[] = [];
  const states: Record<string, Snapshot> = {};
  async function client(id: string) {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      extraHeaders: { Origin: "http://localhost:5173" },
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    socket.on("snapshot", (s) => (states[id] = s));
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  }
  async function send(
    socket: Socket,
    id: string,
    type: string,
    payload: unknown = {},
    requestId = randomUUID(),
  ) {
    return (await socket.timeout(1000).emitWithAck("command", {
      type,
      payload,
      requestId,
      roundId: states[id]?.roundId ?? null,
      phaseId: states[id]?.phaseId,
    })) as Ack;
  }
  try {
    const a = await client("a"),
      b = await client("b");
    const requestId = randomUUID();
    const created = await send(a, "a", "create", { name: "One" }, requestId);
    assert(created.ok && created.session);
    const duplicate = await a.timeout(1000).emitWithAck("command", {
      type: "create",
      payload: { name: "One" },
      requestId,
      roundId: null,
    });
    assert.deepEqual(duplicate, created);
    assert.equal(app.engine.rooms.size, 1);
    const joined = await send(b, "b", "join", {
      name: "Two",
      code: created.session.code,
    });
    assert(joined.ok && joined.session);
    assert(
      (
        await send(a, "a", "settings", {
          settings: { ...DEFAULT_SETTINGS, mode: "convince_me", count: 5 },
        })
      ).ok,
    );
    await until(
      () =>
        states.b.settings.mode === "convince_me" &&
        states.b.phaseId === states.a.phaseId,
    );
    const ready = await Promise.all([
      send(a, "a", "ready", { ready: true }),
      send(b, "b", "ready", { ready: true }),
    ]);
    assert(
      ready.every((r) => r.ok),
      JSON.stringify(ready),
    );
    assert((await send(a, "a", "start")).ok);
    await until(
      () => states.a.phase === "answering" && states.b.phase === "answering",
    );
    assert((await send(a, "a", "answer", { value: "PRIVATE_ALPHA" })).ok);
    await until(() => states.b.players.some((p) => p.submitted));
    assert(!JSON.stringify(states.b).includes("PRIVATE_ALPHA"));
    b.disconnect();
    await until(() => states.a.phase === "paused");
    const b2 = await client("b2");
    assert(
      (
        await send(b2, "b2", "resume", {
          code: joined.session.code,
          token: joined.session.token,
        })
      ).ok,
    );
    assert(!JSON.stringify(states.b2).includes("PRIVATE_ALPHA"));
    assert.equal(states.b2.selfId, joined.session.playerId);
    assert((await send(b2, "b2", "answer", { value: "PRIVATE_BETA" })).ok);
    await until(() => states.a.phase === "evaluating");
    assert.equal(states.a.answers?.[joined.session.playerId], "PRIVATE_BETA");
    assert((await send(a, "a", "vote", { value: "yes" })).ok);
    await until(() => states.b2.players.some((p) => p.voted));
    assert.equal(states.b2.votes, null);
    assert((await send(b2, "b2", "vote", { value: "yes" })).ok);
    await until(() => states.a.phase === "round_result");
    assert.equal(states.a.stats.points, 1);
    await send(a, "a", "continue");
    assert.equal(states.a.phase, "round_result");
    await send(b2, "b2", "continue");
    await until(() => states.a.phase === "answering");
    const answers = await Promise.all([
      send(a, "a", "answer", { value: "simultaneous a" }),
      send(b2, "b2", "answer", { value: "simultaneous b" }),
    ]);
    assert(answers.every((r) => r.ok));
    await until(() => states.a.phase === "evaluating");
    assert((await send(a, "a", "leave")).ok);
    await until(() => states.b2.phase === "lobby");
    assert.equal(states.b2.players.length, 1);
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) =>
      r.json(),
    );
    assert.deepEqual(health, { ok: true });
  } finally {
    clients.forEach((c) => c.disconnect());
    await app.close();
  }
});
test("unapproved Origin is rejected before a Socket.IO connection", async () => {
  const app = createApp();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (app.http.address() as { port: number }).port;
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    extraHeaders: { Origin: "https://untrusted.example" },
    reconnection: false,
    timeout: 500,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect_error", () => resolve());
      socket.once("connect", () => reject(new Error("Origin accepted")));
    });
    assert.equal(app.engine.connections.size, 0);
  } finally {
    socket.disconnect();
    await app.close();
  }
});
