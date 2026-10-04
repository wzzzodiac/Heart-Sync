# Editing the questions

These JSON files are the single source of truth for the built-in bank:

| File                         | Mode            | ID prefix |
| ---------------------------- | --------------- | --------- |
| `01-most-likely.json`        | `most_likely`   | `ml_`     |
| `02-this-or-that.json`       | `this_or_that`  | `tt_`     |
| `03-convince-me.json`        | `convince_me`   | `cm_`     |
| `04-guess-your-partner.json` | `guess_partner` | `gp_`     |

Each file contains an array: an opening `[` and closing `]`, with question objects in numeric ID order. The original seed has IDs 001–030 in each file. The expansion uses IDs 031–070 in each file. The four 071 examples below are instructions for adding questions, **not extra bank records**. Never renumber an existing ID after removing another question. Use the next never-used number (consult Git history if the latest number was deleted). Every ID must be globally unique and match its mode's prefix.

## Current bank: 280 questions

Each mode has 70 questions. IDs 001–030 come from the original seed; IDs 031–070 are the expansion. All 280 questions have been reviewed for simple A2/B1 English. Wording has changed, but IDs, modes, packs, option IDs, and ordering stay the same. The 40 additions per mode are grouped in this order:

| IDs     | Pack         | Added per mode |
| ------- | ------------ | -------------- |
| 031–040 | `fun`        | 10             |
| 041–050 | `chaotic`    | 10             |
| 051–060 | `spicy`      | 10             |
| 061–070 | `dark_humor` | 10             |

For a new question, use the next unused ID (currently 071) and set its `pack`. Adult flirtation belongs in `spicy`; morbid fictional humor belongs in `dark_humor`, so both remain optional. A tag alone does not control selection. Keep questions in English and use fictional or general situations rather than private personal details.

## English level: A2/B1

Write for adults who are learning English. A2/B1 is an editorial target, not a certified language assessment. Keep the humor, romance, and original question idea while making the task easy to understand.

- Use common words and direct questions. Prefer "choose" to "select", "guess" to "predict", and "tell me why" to "make your case".
- Aim for one short sentence, or two short sentences when a situation needs context. Prefer roughly 8–20 words per sentence; clarity matters more than an exact count.
- Avoid idioms, slang, legal language, and jokes that require knowledge of a TV show or culture. Explain an unusual fictional situation in plain words.
- Check both answer options in This or That. They must be as easy to read as the question, and they must keep the same meaning and order.
- In Convince Me, make the action clear: suggest, describe, explain, or give a reason. Do not use "pitch" or "sell me on it" as instructions.
- In Guess Your Partner, keep `{name}` exactly. Do not replace it with "you": both players see the same question about the named person.
- Keep adult and dark humor in their optional packs. Simple English should not remove the theme or turn the game into a children's game.
- Leave already-clear questions alone. When editing wording, keep IDs and all gameplay fields unchanged.

Examples: "What household chore would {name} most gladly outsource?" becomes "What job at home would {name} pay someone else to do?". "Pitch a low-budget date" becomes "Suggest a cheap date. Explain your idea."

## Required fields

- `id`: stable ID, for example `cm_071`.
- `mode`: exactly the mode in the table.
- `pack`: one of `fun`, `cute`, `deep`, `chaotic`, `memories`, `future`, `spicy`, `dark_humor`. All standard packs is a UI filter, not a pack. The two optional packs are excluded from new rooms until explicitly selected.
- `text`: a nonempty English question, at most 240 characters.
- `options`: only for This or That. Exactly two different nonempty texts, at most 160 characters each, with IDs `a` and `b` in that order.
- `tags`: optional array of up to 10 nonempty short strings (at most 40 characters each).

Guess Your Partner must include `{name}` literally. Only that placeholder is allowed, and only in that mode. Do not write a real player's name: the server inserts the target's display label. Do not add `options` to other modes. Most Likely uses the current player IDs automatically. Do not add unrecognized fields or comments to JSON.

## Add a question

1. Open the correct JSON file.
2. Copy an existing object or the matching full example below.
3. Put a comma after the previous object's closing `}`. Paste the new object before the final `]`.
4. Choose the next unused ID and edit the pack and text. Keep double quotes; escape a quote inside text as `\"`.
5. Do not put a comma after the last object. Save as UTF-8.
6. Run the validation and catalog commands from the repository root:

```sh
npm run validate:questions
npm run catalog
npm run build
npm test
```

The backend refuses to start with an invalid bank. Error messages identify invalid fields, IDs, options, placeholders or ordering. [`CATALOG.md`](CATALOG.md) is generated from the JSON; do not edit it directly.

### Who's Most Likely?

```json
{
  "id": "ml_071",
  "mode": "most_likely",
  "pack": "fun",
  "text": "Who is more likely to name every plant in the house?",
  "tags": ["daily-life"]
}
```

### This or That

```json
{
  "id": "tt_071",
  "mode": "this_or_that",
  "pack": "cute",
  "text": "Choose your favorite Sunday breakfast.",
  "options": [
    { "id": "a", "text": "Pancakes at home" },
    { "id": "b", "text": "Breakfast at a cafe" }
  ],
  "tags": ["food"]
}
```

### Convince Me

```json
{
  "id": "cm_071",
  "mode": "convince_me",
  "pack": "cute",
  "text": "Suggest a small way to celebrate after a difficult Monday.",
  "tags": ["daily-life"]
}
```

### Guess Your Partner

```json
{
  "id": "gp_071",
  "mode": "guess_partner",
  "pack": "fun",
  "text": "What dessert would {name} choose if every dessert was available?",
  "tags": ["food"]
}
```

## Publish an edit

Review and commit the JSON changes plus the regenerated catalog. Push only with the owner's authorization, then follow [`docs/deployment.md`](../docs/deployment.md). **Deploy the backend again** to load the updated bank. Do this after current players have left; deployment loses in-memory rooms. Frontend-only Pages publishing does not update the backend question bank.

This is a **public repository**. Questions and history must never contain passwords, session tokens, private experiences or other secrets. Temporary room questions belong in the lobby editor; they are held in server memory and never written into these files or GitHub.
