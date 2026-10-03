export const MODES = [
  "most_likely",
  "this_or_that",
  "convince_me",
  "guess_partner",
] as const;
export type Mode = (typeof MODES)[number];
export const PACKS = [
  "fun",
  "cute",
  "deep",
  "chaotic",
  "memories",
  "future",
] as const;
export type Pack = (typeof PACKS)[number];
export const MODE_INFO: Record<
  Mode,
  { name: string; description: string; symbol: string }
> = {
  most_likely: {
    name: "Who's Most Likely?",
    description: "Pick a person. Match your picks to earn a point.",
    symbol: "↗",
  },
  this_or_that: {
    name: "This or That",
    description: "Two possibilities. Choose secretly and see if you agree.",
    symbol: "⇄",
  },
  convince_me: {
    name: "Convince Me",
    description: "Make your case, then privately judge each other’s pitch.",
    symbol: "✦",
  },
  guess_partner: {
    name: "Guess Your Partner",
    description: "One answers, one predicts. Both write at the same time.",
    symbol: "◎",
  },
};
export interface Question {
  id: string;
  mode: Mode;
  pack: Pack;
  text: string;
  options?: { id: "a" | "b"; text: string }[];
  tags?: string[];
}
export interface Settings {
  mode: Mode | "mixed";
  count: 5 | 10 | 15 | 20;
  seconds: 0 | 15 | 30 | 60;
  packs: Pack[];
  includeCustom: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  mode: "mixed",
  count: 10,
  seconds: 30,
  packs: [...PACKS],
  includeCustom: true,
};
export type Phase =
  | "lobby"
  | "countdown"
  | "answering"
  | "evaluating"
  | "round_result"
  | "finished"
  | "paused";
export type Vote = "yes" | "no" | "correct" | "close" | "nope";
export interface Result {
  roundId: string;
  question: Question;
  status: "complete" | "incomplete" | "skipped";
  points: number;
  message: string;
  answers: Record<string, string>;
  votes: Record<string, Vote>;
  targetId?: string;
}
export interface Stats {
  complete: number;
  incomplete: number;
  skipped: number;
  points: number;
  percent: number | null;
  byMode: Record<
    Mode,
    {
      complete: number;
      points: number;
      matches: number;
      positiveVotes: number;
      correct: number;
      partial: number;
    }
  >;
}
export interface Snapshot {
  code: string;
  selfId: string;
  hostId: string;
  phase: Phase;
  pausedPhase?: Phase;
  phaseId: string;
  roundId: string | null;
  serverNow: number;
  deadlineAt: number | null;
  graceUntil: number | null;
  players: {
    id: string;
    name: string;
    label: string;
    connected: boolean;
    ready: boolean;
    submitted: boolean;
    voted: boolean;
    continued: boolean;
    skip: boolean;
  }[];
  settings: Settings;
  custom: Question[];
  availability: { total: number; custom: number; error: string | null };
  round: number;
  question: Question | null;
  targetId?: string;
  answers: Record<string, string> | null;
  votes: Record<string, Vote> | null;
  ownAnswer: string | null;
  ownVote: Vote | null;
  result: Result | null;
  stats: Stats;
  history: Result[];
  finalMessage: string;
  notice: string;
}
export interface Command {
  requestId: string;
  type: string;
  roundId?: string | null;
  phaseId?: string;
  payload?: unknown;
}
export type Ack =
  | { ok: true; session?: { code: string; playerId: string; token: string } }
  | { ok: false; error: string; code: string };
export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
export function validateQuestion(
  q: unknown,
  custom = false,
): asserts q is Question {
  if (!isRecord(q)) throw new Error("Question must be an object.");
  if (
    Object.keys(q).some(
      (k) => !["id", "mode", "pack", "text", "options", "tags"].includes(k),
    )
  )
    throw new Error("Unknown question field.");
  if (
    typeof q.id !== "string" ||
    !(custom ? /^custom_[a-zA-Z0-9_-]{1,64}$/ : /^(ml|tt|cm|gp)_\d{3,}$/).test(
      q.id,
    )
  )
    throw new Error("Invalid question ID.");
  if (!MODES.includes(q.mode as Mode) || (custom && q.mode === "guess_partner"))
    throw new Error("Invalid question mode.");
  const prefixes: Record<string, string> = {
    most_likely: "ml_",
    this_or_that: "tt_",
    convince_me: "cm_",
    guess_partner: "gp_",
  };
  if (!custom && !q.id.startsWith(prefixes[q.mode as string]))
    throw new Error("Question ID and mode disagree.");
  if (!PACKS.includes(q.pack as Pack)) throw new Error("Invalid pack.");
  if (typeof q.text !== "string" || !q.text.trim() || q.text.length > 240)
    throw new Error("Question text must be 1–240 characters.");
  const placeholders = q.text.match(/\{[^}]*\}/g) || [];
  if (
    q.mode === "guess_partner"
      ? !placeholders.length || placeholders.some((p) => p !== "{name}")
      : placeholders.length > 0
  )
    throw new Error(
      "Invalid placeholder: only Guess Your Partner uses {name}.",
    );
  if (q.text.replaceAll("{name}", "").match(/[{}]/))
    throw new Error("Invalid placeholder braces.");
  if (q.mode === "this_or_that") {
    if (!Array.isArray(q.options) || q.options.length !== 2)
      throw new Error("Provide exactly two options.");
    q.options.forEach((o, i) => {
      if (
        !isRecord(o) ||
        Object.keys(o).some((k) => !["id", "text"].includes(k)) ||
        o.id !== ["a", "b"][i] ||
        typeof o.text !== "string" ||
        !o.text.trim() ||
        o.text.length > 160
      )
        throw new Error("Options require IDs a/b and 1–160 characters.");
    });
    if (
      q.options[0].text.trim().toLowerCase() ===
      q.options[1].text.trim().toLowerCase()
    )
      throw new Error("Options must be different.");
  } else if (q.options !== undefined)
    throw new Error("Only This or That has fixed options.");
  if (
    q.tags !== undefined &&
    (!Array.isArray(q.tags) ||
      q.tags.length > 10 ||
      q.tags.some((t) => typeof t !== "string" || !t.trim() || t.length > 40))
  )
    throw new Error("Invalid tags.");
}
export function validateSettings(x: unknown): asserts x is Settings {
  if (
    !isRecord(x) ||
    Object.keys(x).some(
      (k) =>
        !["mode", "count", "seconds", "packs", "includeCustom"].includes(k),
    ) ||
    !["mixed", ...MODES].includes(x.mode as string) ||
    ![5, 10, 15, 20].includes(x.count as number) ||
    ![0, 15, 30, 60].includes(x.seconds as number) ||
    typeof x.includeCustom !== "boolean" ||
    !Array.isArray(x.packs) ||
    x.packs.some((p) => !PACKS.includes(p as Pack)) ||
    new Set(x.packs).size !== x.packs.length
  )
    throw new Error("Invalid game settings.");
}
