import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  MODES,
  isRecord,
  validateQuestion,
  validateSettings,
  type Ack,
  type Command,
  type Mode,
  type Phase,
  type Question,
  type Result,
  type Settings,
  type Snapshot,
  type Stats,
  type Vote,
} from "../shared/schema.js";

class GameError extends Error {
  constructor(
    message: string,
    readonly code = "INVALID_ACTION",
  ) {
    super(message);
  }
}
function requireThat(
  value: unknown,
  message: string,
  code?: string,
): asserts value {
  if (!value) throw new GameError(message, code);
}
const shuffle = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const comments = {
  full: [
    "Same braincell detected.",
    "A very well-timed high five.",
    "Two minds, one little spark.",
    "That deserves a victory snack.",
    "Beautifully on the same wavelength.",
  ],
  half: [
    "Almost a mind-reading superpower.",
    "Half a point, a whole conversation.",
    "A little overlap goes a long way.",
    "Close enough for a shared smile.",
    "Your wavelengths are waving hello.",
  ],
  zero: [
    "A plot twist worth discussing.",
    "Different picks, same team.",
    "Variety keeps the story interesting.",
    "Two perspectives, plenty to talk about.",
    "An unexpected chapter in your story.",
  ],
  incomplete: [
    "A little more time would have helped.",
    "This one stays an open conversation.",
    "No rush. This round sits out the score.",
    "A thought still in progress.",
    "Some answers deserve more breathing room.",
  ],
  skipped: [
    "Taking the scenic route.",
    "A shared pass is still teamwork.",
    "On to a different little adventure.",
    "This chapter can wait.",
    "A fresh question awaits.",
  ],
  high: [
    "Your wavelengths found a rhythm.",
    "Quite the shared braincell collection.",
    "A pocketful of matching moments.",
    "That was a lovely little sync.",
    "You made a good team of guesses.",
  ],
  mid: [
    "A little sync, a little surprise.",
    "Plenty of sparks and plot twists.",
    "Some matches, some new discoveries.",
    "A lovely mix of familiar and unexpected.",
    "Your story has more than one perspective.",
  ],
  low: [
    "Different wavelengths, same cozy evening.",
    "You have plenty of new things to discuss.",
    "A wonderfully unpredictable adventure.",
    "A few surprises for your next date.",
    "The conversation is the real keepsake.",
  ],
  noScore: [
    "No score this time. There is always another conversation.",
    "A quiet scorecard, a shared evening.",
    "The questions can wait. Your time together counts.",
    "A little detour, no points required.",
    "Some game nights are all about the conversation.",
  ],
};
const pick = (key: keyof typeof comments) =>
  comments[key][randomInt(comments[key].length)];
interface Player {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  disconnectedAt: number | null;
  ready: boolean;
  cache: Map<string, { fingerprint: string; ack: Ack }>;
}
interface Round {
  id: string;
  question: Question;
  targetId?: string;
  answers: Record<string, string>;
  votes: Record<string, Vote>;
  skip: Set<string>;
  continued: Set<string>;
  result: Result | null;
}
interface Room {
  code: string;
  hostId: string;
  players: Player[];
  settings: Settings;
  custom: Question[];
  phase: Phase;
  phaseId: string;
  deadlineAt: number | null;
  pausedPhase?: Phase;
  remaining: number | null;
  deck: Question[];
  index: number;
  guessCount: number;
  round: Round | null;
  history: Result[];
  finalMessage: string;
  notice: string;
  lastActivity: number;
}
export interface EngineOptions {
  now?: () => number;
  countdownMs?: number;
  graceMs?: number;
  ttlMs?: number;
  evaluationMs?: number;
  answerMs?: number;
}
export class Engine {
  readonly rooms = new Map<string, Room>();
  readonly connections = new Map<string, { room: Room; player: Player }>();
  onChange: (socketId: string, snapshot: Snapshot) => void = () => {};
  onClose: (socketId: string, reason: string) => void = () => {};
  readonly now: () => number;
  constructor(
    readonly bank: Question[],
    readonly options: EngineOptions = {},
  ) {
    this.now = options.now || Date.now;
  }
  private phase(room: Room, phase: Phase, ms: number | null = null) {
    room.phase = phase;
    room.phaseId = randomUUID();
    room.deadlineAt = ms === null ? null : this.now() + ms;
  }
  private invalidate(room: Room) {
    for (const p of room.players) p.ready = false;
    room.phaseId = randomUUID();
  }
  private normalizeCode(value: unknown) {
    requireThat(
      typeof value === "string" && value.length <= 30,
      "Enter a six-character room code.",
    );
    const code = value.replace(/\s/g, "").toUpperCase();
    requireThat(
      /^[A-HJ-NP-Z2-9]{6}$/.test(code),
      "Enter a six-character room code.",
    );
    return code;
  }
  private name(value: unknown) {
    requireThat(typeof value === "string", "Enter your name.");
    const name = value.trim();
    requireThat(
      name.length > 0 && name.length <= 24 && !/[\x00-\x1f\x7f]/.test(name),
      "Use a name of 1–24 characters.",
    );
    return name;
  }
  private newPlayer(name: string, socketId: string): Player {
    return {
      id: randomUUID(),
      token: randomBytes(32).toString("hex"),
      name,
      socketId,
      disconnectedAt: null,
      ready: false,
      cache: new Map(),
    };
  }
  private session(room: Room, player: Player): Ack {
    return {
      ok: true,
      session: { code: room.code, playerId: player.id, token: player.token },
    };
  }
  private connect(room: Room, player: Player, socketId: string) {
    if (player.socketId && player.socketId !== socketId) {
      const old = player.socketId;
      this.connections.delete(old);
      this.onClose(old, "This session opened in another tab.");
    }
    player.socketId = socketId;
    player.disconnectedAt = null;
    this.connections.set(socketId, { room, player });
    if (room.phase === "paused" && room.players.every((p) => p.socketId)) {
      const phase = room.pausedPhase!;
      delete room.pausedPhase;
      room.phase = phase;
      room.deadlineAt =
        room.remaining === null ? null : this.now() + room.remaining;
      room.remaining = null;
    }
  }
  availability(room: Room) {
    const custom = room.settings.includeCustom
      ? room.custom.filter(
          (q) =>
            room.settings.mode === "mixed" || q.mode === room.settings.mode,
        )
      : [];
    const bank = this.bank.filter(
      (q) =>
        room.settings.packs.includes(q.pack) &&
        (room.settings.mode === "mixed" || q.mode === room.settings.mode),
    );
    return {
      custom,
      bank,
      total: custom.length + bank.length,
      error:
        custom.length > room.settings.count
          ? `${custom.length} room questions exceed ${room.settings.count} rounds. Remove questions or increase the round count.`
          : custom.length + bank.length < room.settings.count
            ? `Only ${custom.length + bank.length} questions available. Reduce the round count or include more packs.`
            : null,
    };
  }
  select(room: Room) {
    const available = this.availability(room);
    requireThat(!available.error, available.error || "");
    const deck = [...available.custom];
    const counts = Object.fromEntries(
      MODES.map((m) => [m, deck.filter((q) => q.mode === m).length]),
    ) as Record<Mode, number>;
    const pools = Object.fromEntries(
      MODES.map((m) => [
        m,
        shuffle(available.bank.filter((q) => q.mode === m)),
      ]),
    ) as Record<Mode, Question[]>;
    while (deck.length < room.settings.count) {
      const candidates = shuffle(MODES.filter((m) => pools[m].length > 0));
      candidates.sort((a, b) => counts[a] - counts[b]);
      const mode = candidates[0];
      requireThat(mode, "Not enough questions.");
      deck.push(pools[mode].pop()!);
      counts[mode]++;
    }
    return shuffle(deck);
  }
  private startRound(room: Room) {
    const question = room.deck[room.index];
    const targetId =
      question.mode === "guess_partner"
        ? room.players[room.guessCount++ % 2].id
        : undefined;
    room.round = {
      id: randomUUID(),
      question,
      targetId,
      answers: {},
      votes: {},
      skip: new Set(),
      continued: new Set(),
      result: null,
    };
    this.phase(room, "countdown", this.options.countdownMs ?? 3000);
  }
  private finishRound(room: Room, status: Result["status"], points = 0) {
    const r = room.round!;
    if (r.result) return;
    r.result = {
      roundId: r.id,
      question: r.question,
      status,
      points,
      answers: { ...r.answers },
      votes: { ...r.votes },
      targetId: r.targetId,
      message: pick(
        status === "complete"
          ? points === 1
            ? "full"
            : points === 0.5
              ? "half"
              : "zero"
          : status,
      ),
    };
    room.history.push(r.result);
    this.phase(room, "round_result");
  }
  private closeAnswers(room: Room) {
    const r = room.round!;
    if (room.players.some((p) => r.answers[p.id] === undefined)) {
      this.finishRound(room, "incomplete");
      return;
    }
    if (r.question.mode === "most_likely" || r.question.mode === "this_or_that")
      this.finishRound(
        room,
        "complete",
        r.answers[room.players[0].id] === r.answers[room.players[1].id] ? 1 : 0,
      );
    else this.phase(room, "evaluating", this.options.evaluationMs ?? 30000);
  }
  private closeVotes(room: Room) {
    const r = room.round!;
    const voters =
      r.question.mode === "guess_partner"
        ? [r.targetId!]
        : room.players.map((p) => p.id);
    if (voters.some((id) => r.votes[id] === undefined)) {
      this.finishRound(room, "incomplete");
      return;
    }
    this.finishRound(
      room,
      "complete",
      r.question.mode === "convince_me"
        ? voters.filter((id) => r.votes[id] === "yes").length / 2
        : r.votes[r.targetId!] === "correct"
          ? 1
          : r.votes[r.targetId!] === "close"
            ? 0.5
            : 0,
    );
  }
  private reset(room: Room, notice = "") {
    room.deck = [];
    room.index = 0;
    room.guessCount = 0;
    room.round = null;
    room.history = [];
    room.notice = notice;
    room.finalMessage = "";
    room.remaining = null;
    delete room.pausedPhase;
    this.phase(room, "lobby");
    this.invalidate(room);
    if (room.players.some((p) => !p.socketId)) this.pause(room);
  }
  private remove(room: Room, player: Player) {
    if (player.socketId) this.connections.delete(player.socketId);
    room.players = room.players.filter((p) => p !== player);
    if (!room.players.length) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    this.reset(
      room,
      "Your partner left. Invite someone to start a fresh game.",
    );
  }
  private pause(room: Room) {
    if (room.phase === "paused") return;
    room.pausedPhase = room.phase;
    room.remaining =
      room.deadlineAt === null
        ? null
        : Math.max(0, room.deadlineAt - this.now());
    room.phase = "paused";
    room.deadlineAt = null;
  }
  disconnect(socketId: string) {
    this.tick();
    const found = this.connections.get(socketId);
    if (!found) return;
    this.connections.delete(socketId);
    found.player.socketId = null;
    found.player.disconnectedAt = this.now();
    this.pause(found.room);
    this.emit(found.room);
  }
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (now - room.lastActivity > (this.options.ttlMs ?? 7200000)) {
        for (const p of room.players) {
          if (p.socketId) {
            this.connections.delete(p.socketId);
            this.onClose(
              p.socketId,
              "This room expired after two hours without game activity.",
            );
          }
        }
        this.rooms.delete(room.code);
        continue;
      }
      let changed = false;
      for (const p of [...room.players])
        if (
          p.disconnectedAt !== null &&
          now - p.disconnectedAt >= (this.options.graceMs ?? 60000)
        ) {
          this.remove(room, p);
          changed = true;
        }
      if (!this.rooms.has(room.code)) continue;
      if (room.deadlineAt !== null && now >= room.deadlineAt) {
        if (room.phase === "countdown")
          this.phase(
            room,
            "answering",
            room.settings.seconds === 0
              ? null
              : (this.options.answerMs ?? room.settings.seconds * 1000),
          );
        else if (room.phase === "answering") this.closeAnswers(room);
        else if (room.phase === "evaluating") this.closeVotes(room);
        changed = true;
      }
      if (changed) this.emit(room);
    }
  }
  execute(socketId: string, input: unknown): Ack {
    try {
      this.tick();
      requireThat(
        isRecord(input) &&
          typeof input.requestId === "string" &&
          /^[\w-]{8,80}$/.test(input.requestId) &&
          typeof input.type === "string",
        "Malformed command.",
      );
      const cmd = input as unknown as Command;
      const payload = cmd.payload ?? {};
      requireThat(isRecord(payload), "Malformed payload.");
      let found = this.connections.get(socketId);
      if (["create", "join", "resume"].includes(cmd.type)) {
        if (found) {
          requireThat(
            cmd.type === "resume" &&
              payload.token === found.player.token &&
              payload.code === found.room.code,
            "Already in a room.",
          );
          this.emit(found.room);
          return this.session(found.room, found.player);
        }
        let room: Room;
        let player: Player;
        if (cmd.type === "create") {
          requireThat(
            this.rooms.size < 5,
            "All five rooms are in use. Please try again later.",
            "ROOM_LIMIT",
          );
          const name = this.name(payload.name);
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code: string;
          do {
            code = Array.from(
              { length: 6 },
              () => alphabet[randomInt(alphabet.length)],
            ).join("");
          } while (this.rooms.has(code));
          player = this.newPlayer(name, socketId);
          room = {
            code,
            hostId: player.id,
            players: [player],
            settings: structuredClone(DEFAULT_SETTINGS),
            custom: [],
            phase: "lobby",
            phaseId: randomUUID(),
            deadlineAt: null,
            remaining: null,
            deck: [],
            index: 0,
            guessCount: 0,
            round: null,
            history: [],
            finalMessage: "",
            notice: "",
            lastActivity: this.now(),
          };
          this.rooms.set(code, room);
        } else {
          const code = this.normalizeCode(payload.code);
          const existing = this.rooms.get(code);
          requireThat(
            existing,
            "Room no longer available. Create a new one.",
            "ROOM_GONE",
          );
          room = existing;
          if (cmd.type === "join") {
            requireThat(
              room.phase === "lobby",
              "This room is playing or reconnecting.",
              "ROOM_BUSY",
            );
            requireThat(
              room.players.length < 2,
              "This room already has two players.",
              "ROOM_FULL",
            );
            player = this.newPlayer(this.name(payload.name), socketId);
            room.players.push(player);
            this.invalidate(room);
          } else {
            requireThat(
              typeof payload.token === "string" && payload.token.length === 64,
              "Session no longer available.",
              "SESSION_GONE",
            );
            const existingPlayer = room.players.find(
              (p) => p.token === payload.token,
            );
            requireThat(
              existingPlayer,
              "Session no longer available.",
              "SESSION_GONE",
            );
            player = existingPlayer;
          }
        }
        this.connect(room, player, socketId);
        room.lastActivity = this.now();
        this.emit(room);
        return this.session(room, player);
      }
      requireThat(found, "Join a room first.", "SESSION_GONE");
      const { room, player } = found;
      const fingerprint = JSON.stringify(cmd);
      const cached = player.cache.get(cmd.requestId);
      if (cached) {
        requireThat(
          cached.fingerprint === fingerprint,
          "Request ID already used.",
        );
        this.emit(room);
        return cached.ack;
      }
      if (cmd.type === "sync") {
        this.emit(room);
        return { ok: true };
      }
      if (cmd.type === "leave") {
        this.remove(room, player);
        this.emit(room);
        return { ok: true };
      }
      requireThat(room.phase !== "paused", "Waiting for reconnection.");
      requireThat(
        cmd.phaseId === room.phaseId &&
          cmd.roundId === (room.round?.id ?? null),
        "This action belongs to an earlier phase.",
        "STALE",
      );
      switch (cmd.type) {
        case "settings":
          requireThat(
            room.phase === "lobby" && player.id === room.hostId,
            "Only the host can change lobby settings.",
          );
          validateSettings(payload.settings);
          room.settings = structuredClone(payload.settings);
          this.invalidate(room);
          break;
        case "custom": {
          requireThat(
            room.phase === "lobby" && player.id === room.hostId,
            "Only the host can edit room questions.",
          );
          requireThat(
            Array.isArray(payload.questions) && payload.questions.length <= 20,
            "Use at most 20 room questions.",
          );
          const ids = new Set<string>();
          for (const q of payload.questions) {
            validateQuestion(q, true);
            requireThat(!ids.has(q.id), "Duplicate room question ID.");
            ids.add(q.id);
          }
          room.custom = structuredClone(payload.questions) as Question[];
          this.invalidate(room);
          break;
        }
        case "ready":
          requireThat(
            room.phase === "lobby" && typeof payload.ready === "boolean",
            "Invalid ready action.",
          );
          player.ready = payload.ready;
          break;
        case "start":
          requireThat(
            room.phase === "lobby" &&
              player.id === room.hostId &&
              room.players.length === 2 &&
              room.players.every((p) => p.socketId && p.ready),
            "Both players must be connected and Ready.",
          );
          room.deck = this.select(room);
          room.index = 0;
          room.history = [];
          room.guessCount = 0;
          room.notice = "";
          this.startRound(room);
          break;
        case "answer": {
          requireThat(room.phase === "answering", "Answers are closed.");
          const r = room.round!;
          requireThat(
            r.answers[player.id] === undefined,
            "Your answer is already locked.",
          );
          const value = payload.value;
          requireThat(typeof value === "string", "Invalid answer.");
          if (r.question.mode === "most_likely")
            requireThat(
              room.players.some((p) => p.id === value),
              "Choose one of the two players.",
            );
          else if (r.question.mode === "this_or_that")
            requireThat(
              r.question.options!.some((o) => o.id === value),
              "Choose option a or b.",
            );
          else
            requireThat(
              value.trim().length > 0 && value.length <= 500,
              "Write 1–500 characters.",
            );
          r.answers[player.id] = value;
          if (room.players.every((p) => r.answers[p.id] !== undefined))
            this.closeAnswers(room);
          break;
        }
        case "vote": {
          requireThat(room.phase === "evaluating", "Evaluation is closed.");
          const r = room.round!;
          requireThat(
            r.question.mode === "convince_me" || player.id === r.targetId,
            "Only the target can evaluate this prediction.",
          );
          requireThat(
            r.votes[player.id] === undefined,
            "Your evaluation is already locked.",
          );
          requireThat(
            (r.question.mode === "convince_me"
              ? ["yes", "no"]
              : ["correct", "close", "nope"]
            ).includes(payload.value as string),
            "Invalid evaluation.",
          );
          r.votes[player.id] = payload.value as Vote;
          if (
            r.question.mode === "guess_partner" ||
            room.players.every((p) => r.votes[p.id] !== undefined)
          )
            this.closeVotes(room);
          break;
        }
        case "skip":
          requireThat(
            room.phase === "answering",
            "Skip is only available while answering.",
          );
          room.round!.skip.add(player.id);
          if (room.round!.skip.size === 2) this.finishRound(room, "skipped");
          break;
        case "continue":
          requireThat(
            room.phase === "round_result",
            "Wait for the round result.",
          );
          room.round!.continued.add(player.id);
          if (room.players.every((p) => room.round!.continued.has(p.id))) {
            room.index++;
            if (room.index === room.deck.length) {
              this.phase(room, "finished");
              const pct = this.stats(room).percent;
              room.finalMessage =
                pct === null
                  ? pick("noScore")
                  : pick(pct >= 75 ? "high" : pct >= 40 ? "mid" : "low");
            } else this.startRound(room);
          }
          break;
        case "lobby":
        case "again":
          requireThat(room.phase === "finished", "Finish the game first.");
          this.reset(
            room,
            cmd.type === "again"
              ? "Same settings, fresh questions. Both players need to Ready again."
              : "Back together in the lobby.",
          );
          break;
        default:
          throw new GameError("Unknown command.");
      }
      room.lastActivity = this.now();
      const ack: Ack = { ok: true };
      player.cache.set(cmd.requestId, { fingerprint, ack });
      if (player.cache.size > 200)
        player.cache.delete(player.cache.keys().next().value!);
      this.emit(room);
      return ack;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid request.",
        code: error instanceof GameError ? error.code : "INVALID_ACTION",
      };
    }
  }
  stats(room: Room): Stats {
    const complete = room.history.filter((r) => r.status === "complete");
    const points = complete.reduce((s, r) => s + r.points, 0);
    return {
      complete: complete.length,
      points,
      percent: complete.length
        ? Math.round((points / complete.length) * 100)
        : null,
      incomplete: room.history.filter((r) => r.status === "incomplete").length,
      skipped: room.history.filter((r) => r.status === "skipped").length,
      byMode: Object.fromEntries(
        MODES.map((mode) => {
          const results = complete.filter((r) => r.question.mode === mode);
          return [
            mode,
            {
              complete: results.length,
              points: results.reduce((s, r) => s + r.points, 0),
              matches: ["most_likely", "this_or_that"].includes(mode)
                ? results.filter((r) => r.points === 1).length
                : 0,
              positiveVotes:
                mode === "convince_me"
                  ? results.reduce(
                      (s, r) =>
                        s +
                        Object.values(r.votes).filter((v) => v === "yes")
                          .length,
                      0,
                    )
                  : 0,
              correct:
                mode === "guess_partner"
                  ? results.filter((r) => r.points === 1).length
                  : 0,
              partial:
                mode === "guess_partner"
                  ? results.filter((r) => r.points === 0.5).length
                  : 0,
            },
          ];
        }),
      ) as Stats["byMode"],
    };
  }
  snapshot(room: Room, self: Player): Snapshot {
    const r = room.round;
    const effectivePhase =
      room.phase === "paused" ? room.pausedPhase : room.phase;
    const revealed = ["evaluating", "round_result", "finished"].includes(
      effectivePhase!,
    );
    const votesRevealed = ["round_result", "finished"].includes(
      effectivePhase!,
    );
    const availability = this.availability(room);
    const disconnected = room.players.filter((p) => p.disconnectedAt !== null);
    const labels = room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      label:
        room.players.filter((other) => other.name === p.name).length > 1
          ? `${p.name} · Player ${i + 1}`
          : p.name,
      connected: !!p.socketId,
      ready: p.ready,
      submitted: !!r && r.answers[p.id] !== undefined,
      voted: !!r && r.votes[p.id] !== undefined,
      continued: !!r?.continued.has(p.id),
      skip: !!r?.skip.has(p.id),
    }));
    const question = r ? structuredClone(r.question) : null;
    if (question && r?.targetId)
      question.text = question.text.replaceAll(
        "{name}",
        labels.find((p) => p.id === r.targetId)!.label,
      );
    return {
      code: room.code,
      selfId: self.id,
      hostId: room.hostId,
      phase: room.phase,
      pausedPhase: room.pausedPhase,
      phaseId: room.phaseId,
      roundId: r?.id ?? null,
      serverNow: this.now(),
      deadlineAt: room.deadlineAt,
      graceUntil: disconnected.length
        ? Math.min(...disconnected.map((p) => p.disconnectedAt!)) +
          (this.options.graceMs ?? 60000)
        : null,
      players: labels,
      settings: structuredClone(room.settings),
      custom: structuredClone(room.custom),
      availability: {
        total: availability.total,
        custom: availability.custom.length,
        error: availability.error,
      },
      round: Math.min(room.index + 1, room.settings.count),
      question,
      targetId: r?.targetId,
      answers: revealed ? { ...r?.answers } : null,
      votes: votesRevealed ? { ...r?.votes } : null,
      ownAnswer: r?.answers[self.id] ?? null,
      ownVote: r?.votes[self.id] ?? null,
      result: r?.result ? structuredClone(r.result) : null,
      stats: this.stats(room),
      history: structuredClone(room.history),
      finalMessage: room.finalMessage,
      notice: room.notice,
    };
  }
  emit(room: Room) {
    for (const p of room.players)
      if (p.socketId) this.onChange(p.socketId, this.snapshot(room, p));
  }
}
