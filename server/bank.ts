import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODES, validateQuestion, type Question } from "../shared/schema.js";
export const QUESTION_FILES = [
  "01-most-likely.json",
  "02-this-or-that.json",
  "03-convince-me.json",
  "04-guess-your-partner.json",
];
export function loadBank(root = resolve("questions")): Question[] {
  const ids = new Set<string>();
  return QUESTION_FILES.flatMap((file, i) => {
    const data: unknown = JSON.parse(readFileSync(resolve(root, file), "utf8"));
    if (!Array.isArray(data) || !data.length)
      throw new Error(`${file}: expected nonempty array`);
    let previous = 0;
    return data.map((q) => {
      validateQuestion(q);
      if (q.mode !== MODES[i] || ids.has(q.id))
        throw new Error(`${file}: wrong mode or duplicate ID ${q.id}`);
      const number = Number(q.id.split("_")[1]);
      if (number <= previous)
        throw new Error(`${file}: IDs must be in ascending numeric order`);
      previous = number;
      ids.add(q.id);
      return q;
    });
  });
}
