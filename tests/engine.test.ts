import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Engine } from "../server/engine.js";
import { loadBank } from "../server/bank.js";
import {
  DEFAULT_SETTINGS,
  MODES,
  validateQuestion,
  type Ack,
  type Mode,
  type Snapshot,
} from "../shared/schema.js";
function fixture(mode: Mode | "mixed" = "most_likely", options = {}) {
  let now = 1000;
  const engine = new Engine(loadBank(), {
    now: () => now,
    countdownMs: 10,
    graceMs: 60,
    ttlMs: 100000,
    evaluationMs: 30,
    ...options,
  });
  const snapshots: Record<string, Snapshot> = {};
  engine.onChange = (id, s) => {
    snapshots[id] = s;
  };
  const execute = (
    socket: string,
    type: string,
    payload: unknown = {},
    extra = {},
  ) =>
    engine.execute(socket, {
      requestId: randomUUID(),
      type,
      payload,
      phaseId: snapshots[socket]?.phaseId,
      roundId: snapshots[socket]?.roundId ?? null,
      ...extra,
    });
  const ok = (ack: Ack) => {
    assert.equal(ack.ok, true, JSON.stringify(ack));
    return ack;
  };
  const a = ok(execute("a", "create", { name: "Alex" }));
  assert(a.ok && a.session);
  const b = ok(execute("b", "join", { name: "Alex", code: a.session.code }));
  assert(b.ok && b.session);
  ok(
    execute("a", "settings", {
      settings: { ...DEFAULT_SETTINGS, mode, count: 5 },
    }),
  );
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  const start = () => {
    ok(execute("a", "ready", { ready: true }));
    ok(execute("b", "ready", { ready: true }));
    ok(execute("a", "start"));
    advance(10);
    assert.equal(snapshots.a.phase, "answering");
  };
  const answer = (id: string, value: string) =>
    ok(execute(id, "answer", { value }));
  return {
    engine,
    snapshots,
    execute,
    ok,
    advance,
    start,
    answer,
    a: a.session,
    b: b.session,
  };
}
test("bank: exactly 120 unique seed records, placeholders and options validate", () => {
  const bank = loadBank();
  assert.equal(bank.length, 120);
  assert.equal(new Set(bank.map((q) => q.id)).size, 120);
  for (const m of MODES)
    assert.equal(bank.filter((q) => q.mode === m).length, 30);
  assert.throws(() =>
    validateQuestion({ ...bank[0], text: "Unknown {placeholder}" }),
  );
  assert.throws(() =>
    validateQuestion({
      ...bank.find((q) => q.mode === "this_or_that"),
      options: [
        { id: "a", text: "same" },
        { id: "b", text: "SAME" },
      ],
    }),
  );
});
test("Ready barrier, identity labels, host-only settings and ready invalidation", () => {
  const f = fixture();
  assert(!f.execute("a", "start").ok);
  f.ok(f.execute("a", "ready", { ready: true }));
  assert(!f.execute("a", "start").ok);
  assert.match(f.snapshots.a.players[0].label, /Player 1/);
  assert.match(f.snapshots.a.players[1].label, /Player 2/);
  assert(!f.execute("b", "settings", { settings: DEFAULT_SETTINGS }).ok);
  f.ok(
    f.execute("a", "settings", { settings: { ...DEFAULT_SETTINGS, count: 5 } }),
  );
  assert(f.snapshots.a.players.every((p) => !p.ready));
});
for (const mode of ["most_likely", "this_or_that"] as const)
  test(`${mode}: same-time answers, secret snapshots, idempotent retry, immutable score and continue barrier`, () => {
    const f = fixture(mode);
    f.start();
    const initial = f.snapshots.a;
    const value = mode === "most_likely" ? f.a.playerId : "a";
    const cmd = {
      requestId: randomUUID(),
      type: "answer",
      payload: { value },
      roundId: initial.roundId,
      phaseId: initial.phaseId,
    };
    f.ok(f.engine.execute("a", cmd));
    assert.equal(f.snapshots.b.answers, null);
    assert.equal(f.snapshots.b.ownAnswer, null);
    assert.equal(f.snapshots.b.history.length, 0);
    assert.equal(f.snapshots.b.players[0].submitted, true);
    f.ok(f.engine.execute("a", cmd));
    assert(
      !f.execute("a", "answer", {
        value: mode === "most_likely" ? f.b.playerId : "b",
      }).ok,
    );
    f.answer("b", value);
    assert.equal(f.snapshots.a.result?.points, 1);
    assert.equal(f.snapshots.a.history.length, 1);
    f.ok(f.engine.execute("a", cmd));
    assert.equal(f.snapshots.a.stats.points, 1);
    assert(
      !f.execute(
        "a",
        "answer",
        { value },
        { roundId: initial.roundId, phaseId: initial.phaseId },
      ).ok,
    );
    f.ok(f.execute("a", "continue"));
    assert.equal(f.snapshots.a.phase, "round_result");
    const phase = f.snapshots.b.phaseId;
    f.ok(f.execute("b", "continue"));
    assert.equal(f.snapshots.a.phase, "countdown");
    assert(
      !f.execute(
        "b",
        "continue",
        {},
        { phaseId: phase, roundId: initial.roundId },
      ).ok,
    );
    assert.equal(f.snapshots.a.round, 2);
  });
test("Convince Me: simultaneous secret text and votes, positive/half/zero outcomes", () => {
  for (const [votes, score] of [
    [["yes", "yes"], 1],
    [["yes", "no"], 0.5],
    [["no", "no"], 0],
  ] as const) {
    const f = fixture("convince_me");
    f.start();
    f.answer("a", "A secret pitch");
    assert(!JSON.stringify(f.snapshots.b).includes("A secret pitch"));
    f.answer("b", "Another pitch");
    assert.equal(f.snapshots.a.phase, "evaluating");
    assert.equal(f.snapshots.a.answers?.[f.b.playerId], "Another pitch");
    f.ok(f.execute("a", "vote", { value: votes[0], playerId: f.b.playerId }));
    assert.equal(f.snapshots.b.votes, null);
    assert.equal(f.snapshots.b.ownVote, null);
    assert(!f.execute("a", "vote", { value: "no" }).ok);
    f.ok(f.execute("b", "vote", { value: votes[1] }));
    assert.equal(f.snapshots.a.result?.points, score);
    assert.equal(
      f.snapshots.a.stats.byMode.convince_me.positiveVotes,
      score * 2,
    );
  }
});
test("Guess Your Partner: concurrent roles alternate, target-only evaluation and partial score", () => {
  const f = fixture("guess_partner");
  f.start();
  const targets: string[] = [];
  for (let round = 0; round < 5; round++) {
    const target = f.snapshots.a.targetId!;
    targets.push(target);
    assert(!f.snapshots.a.question!.text.includes("{name}"));
    assert.equal(f.snapshots.a.targetId, f.snapshots.b.targetId);
    f.answer("a", "Pasta");
    f.answer("b", "Pasta with pesto");
    const targetSocket = target === f.a.playerId ? "a" : "b";
    const guesser = targetSocket === "a" ? "b" : "a";
    assert(
      !f.execute(guesser, "vote", { value: "correct", playerId: target }).ok,
    );
    f.ok(f.execute(targetSocket, "vote", { value: "close" }));
    assert.equal(f.snapshots.a.result?.points, 0.5);
    f.ok(f.execute("a", "continue"));
    f.ok(f.execute("b", "continue"));
    if (round < 4) f.advance(10);
  }
  assert.deepEqual(targets, [
    f.a.playerId,
    f.b.playerId,
    f.a.playerId,
    f.b.playerId,
    f.a.playerId,
  ]);
  assert.equal(f.snapshots.a.phase, "finished");
  assert.equal(f.snapshots.a.stats.percent, 50);
  assert.equal(f.snapshots.a.stats.byMode.guess_partner.partial, 5);
  f.ok(f.execute("b", "again"));
  assert.equal(f.snapshots.a.phase, "lobby");
  assert(f.snapshots.a.players.every((p) => !p.ready));
  assert(!f.execute("a", "start").ok);
});
test("server deadline wins late answer/skip, missing answers and missing votes are incomplete", () => {
  const f = fixture("convince_me");
  f.start();
  f.answer("a", "saved");
  f.advance(30000);
  assert.equal(f.snapshots.a.result?.status, "incomplete");
  assert.equal(f.snapshots.a.stats.percent, null);
  assert(!f.execute("b", "answer", { value: "late" }).ok);
  assert(!f.execute("b", "skip").ok);
  f.ok(f.execute("a", "continue"));
  f.ok(f.execute("b", "continue"));
  f.advance(10);
  f.answer("a", "a");
  f.answer("b", "b");
  f.ok(f.execute("a", "vote", { value: "yes" }));
  f.advance(30);
  assert.equal(f.snapshots.a.result?.status, "incomplete");
  assert.equal(f.snapshots.a.stats.incomplete, 2);
  assert.equal(f.snapshots.a.votes?.[f.b.playerId], undefined);
});
test("skip requires both; fixed length; no-limit answer phase; blank and oversized text reject", () => {
  const f = fixture("convince_me");
  f.ok(
    f.execute("a", "settings", {
      settings: {
        ...DEFAULT_SETTINGS,
        mode: "convince_me",
        count: 5,
        seconds: 0,
      },
    }),
  );
  f.start();
  assert.equal(f.snapshots.a.deadlineAt, null);
  assert(!f.execute("a", "answer", { value: "   " }).ok);
  assert(!f.execute("a", "answer", { value: "x".repeat(501) }).ok);
  f.ok(f.execute("a", "skip"));
  assert.equal(f.snapshots.a.phase, "answering");
  f.advance(90000);
  assert.equal(f.snapshots.a.phase, "answering");
  f.ok(f.execute("b", "skip"));
  assert.equal(f.snapshots.a.result?.status, "skipped");
  assert.equal(f.snapshots.a.stats.percent, null);
});
test("Mixed selection is balanced and without duplicate IDs, shortage blocks start", () => {
  for (let i = 0; i < 20; i++) {
    const f = fixture("mixed");
    f.start();
    const deck = [...f.engine.rooms.values()][0].deck;
    assert.equal(new Set(deck.map((q) => q.id)).size, 5);
    const sizes = MODES.map((m) => deck.filter((q) => q.mode === m).length);
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
  const f = fixture();
  f.ok(
    f.execute("a", "settings", {
      settings: {
        ...DEFAULT_SETTINGS,
        mode: "most_likely",
        packs: ["deep"],
        count: 5,
      },
    }),
  );
  f.ok(f.execute("a", "ready", { ready: true }));
  f.ok(f.execute("b", "ready", { ready: true }));
  assert(!f.execute("a", "start").ok);
  assert.match(f.snapshots.a.availability.error!, /Only 0/);
});
test("custom validation, editing invalidates Ready, capacity, inclusion before bank and room isolation", () => {
  const f = fixture();
  f.ok(f.execute("a", "ready", { ready: true }));
  const questions = Array.from({ length: 5 }, (_, i) => ({
    id: `custom_${i}`,
    mode: "most_likely",
    pack: "fun",
    text: `Room-only question ${i}?`,
  }));
  assert(!f.execute("b", "custom", { questions }).ok);
  f.ok(f.execute("a", "custom", { questions }));
  assert(!f.snapshots.a.players[0].ready);
  assert.equal(f.snapshots.a.availability.custom, 5);
  assert(
    !f.execute("a", "custom", {
      questions: [
        ...questions,
        { ...questions[0], id: "custom_6", text: "x".repeat(241) },
      ],
    }).ok,
  );
  assert(
    !f.execute("a", "custom", {
      questions: [
        ...questions,
        { ...questions[0], id: "custom_6", mode: "guess_partner" },
      ],
    }).ok,
  );
  f.start();
  assert(
    [...f.engine.rooms.values()][0].deck.every((q) =>
      q.id.startsWith("custom_"),
    ),
  );
  const other = f.engine.execute("c", {
    type: "create",
    requestId: randomUUID(),
    payload: { name: "Other" },
  });
  assert(other.ok);
  assert.equal(f.snapshots.c.custom.length, 0);
  assert.equal(loadBank().length, 120);
  const overflow = fixture();
  overflow.ok(
    overflow.execute("a", "custom", {
      questions: [...questions, { ...questions[0], id: "custom_6" }],
    }),
  );
  assert.match(overflow.snapshots.a.availability.error!, /exceed/);
});
test("room six and player three reject; codes normalize; invalid identity cannot resume", () => {
  const f = fixture();
  assert(!f.execute("c", "join", { name: "Third", code: f.a.code }).ok);
  assert(
    !f.execute("c", "resume", { code: f.a.code, token: "a".repeat(64) }).ok,
  );
  for (let i = 0; i < 4; i++)
    f.ok(f.execute(`extra${i}`, "create", { name: "Player" }));
  const sixth = f.execute("sixth", "create", { name: "Player" });
  assert(!sixth.ok && sixth.code === "ROOM_LIMIT");
  const room = f.snapshots.extra0.code;
  f.ok(
    f.execute("joiner", "join", {
      name: "Second",
      code: ` ${room.toLowerCase().slice(0, 3)} ${room.slice(3)} `,
    }),
  );
});
test("disconnect pauses time; private reconnect restores identity; duplicate connection replaced; grace cleanup transfers host", () => {
  const f = fixture("convince_me");
  f.start();
  f.answer("a", "secret alpha");
  f.advance(100);
  f.engine.disconnect("b");
  assert.equal(f.snapshots.a.phase, "paused");
  f.advance(40);
  f.ok(f.execute("b2", "resume", { code: f.b.code, token: f.b.token }));
  assert.equal(f.snapshots.b2.selfId, f.b.playerId);
  assert.equal(f.snapshots.a.phase, "answering");
  assert.equal(f.snapshots.a.deadlineAt, 31050);
  assert(!JSON.stringify(f.snapshots.b2).includes("secret alpha"));
  const closed: string[] = [];
  f.engine.onClose = (id) => closed.push(id);
  f.ok(f.execute("b3", "resume", { code: f.b.code, token: f.b.token }));
  assert.deepEqual(closed, ["b2"]);
  f.engine.disconnect("b2");
  assert.equal(f.snapshots.a.phase, "answering");
  assert.equal(f.engine.connections.has("b2"), false);
  f.engine.disconnect("a");
  f.advance(60);
  assert.equal(f.snapshots.b3.phase, "lobby");
  assert.equal(f.snapshots.b3.hostId, f.b.playerId);
  assert.equal(f.snapshots.b3.players.length, 1);
  assert.equal(f.snapshots.b3.history.length, 0);
  f.engine.disconnect("b3");
  f.advance(60);
  assert.equal(f.engine.rooms.size, 0);
});
test("pending evaluations remain secret through a reconnect and paused snapshots", () => {
  const f = fixture("convince_me");
  f.start();
  f.answer("a", "one");
  f.answer("b", "two");
  f.ok(f.execute("a", "vote", { value: "yes" }));
  f.engine.disconnect("b");
  assert.equal(f.snapshots.a.votes, null);
  f.ok(f.execute("b2", "resume", { code: f.b.code, token: f.b.token }));
  assert.equal(f.snapshots.b2.votes, null);
  assert.equal(f.snapshots.b2.ownVote, null);
  assert.equal(f.snapshots.b2.phase, "evaluating");
});
test("voluntary leave is immediate, custom questions persist, abandoned-room TTL releases everything", () => {
  const f = fixture("most_likely", { ttlMs: 100 });
  f.ok(
    f.execute("a", "custom", {
      questions: [
        {
          id: "custom_1",
          mode: "most_likely",
          pack: "fun",
          text: "Our question?",
        },
      ],
    }),
  );
  f.start();
  f.ok(f.execute("a", "leave"));
  assert.equal(f.snapshots.b.phase, "lobby");
  assert.equal(f.snapshots.b.custom.length, 1);
  assert.equal(f.snapshots.b.hostId, f.b.playerId);
  f.advance(101);
  assert.equal(f.engine.rooms.size, 0);
  assert.equal(f.engine.connections.size, 0);
});

test("Guess evaluations award exactly 1 / 0.5 / 0, and invalid votes are rejected", () => {
  for (const [vote, points] of [
    ["correct", 1],
    ["close", 0.5],
    ["nope", 0],
  ] as const) {
    const f = fixture("guess_partner");
    f.start();
    f.answer("a", "My answer");
    f.answer("b", "The prediction");
    assert(!f.execute("a", "vote", { value: "yes" }).ok);
    f.ok(f.execute("a", "vote", { value: vote }));
    assert.equal(f.snapshots.a.stats.points, points);
    assert.equal(f.snapshots.a.result?.status, "complete");
  }
});

test("validation rejects malformed events, names, foreign answers and old round IDs", () => {
  const f = fixture();
  for (const input of [
    null,
    [],
    { type: "answer" },
    { requestId: "short", type: "answer" },
  ])
    assert(!f.engine.execute("a", input).ok);
  assert(!f.execute("stranger", "create", { name: "x".repeat(25) }).ok);
  assert(!f.execute("stranger", "create", { name: "  " }).ok);
  f.start();
  assert(!f.execute("stranger", "answer", { value: f.a.playerId }).ok);
  assert(!f.execute("a", "answer", { value: randomUUID() }).ok);
  assert(
    !f.execute(
      "a",
      "answer",
      { value: f.a.playerId },
      { roundId: randomUUID() },
    ).ok,
  );
  assert.equal(f.snapshots.a.players[0].submitted, false);
});

test("both disconnected seats expire, and no-score finish excludes every skipped round", () => {
  const f = fixture();
  f.start();
  for (let i = 0; i < 5; i++) {
    f.ok(f.execute("a", "skip"));
    f.ok(f.execute("b", "skip"));
    f.ok(f.execute("a", "continue"));
    f.ok(f.execute("b", "continue"));
    if (i < 4) f.advance(10);
  }
  assert.equal(f.snapshots.a.phase, "finished");
  assert.equal(f.snapshots.a.stats.percent, null);
  assert.equal(f.snapshots.a.stats.skipped, 5);
  assert.equal(f.snapshots.a.finalMessage, f.snapshots.b.finalMessage);
  f.engine.disconnect("a");
  f.engine.disconnect("b");
  f.advance(60);
  assert.equal(f.engine.rooms.size, 0);
  assert.equal(f.engine.connections.size, 0);
});
