# Heart Sync

A private, simultaneous game night for exactly two people. Choose a room code, answer the same question in secret, and discover your shared wavelength. All player-facing copy is in English.

Four modes, 280 editable questions (70 per mode), six standard packs and two optional packs, optional room questions, and a shared **Sync score**. No accounts, database, chat, analytics, or AI judging. No public room directory or matchmaking. Rank It is not part of V1.

## Quick start

Requires Node.js **22.12+** (Node 24 recommended) and npm. Run everything from the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** in two separate browser tabs or browser profiles. Create a room in one, copy its code, and join in the other. Enter names, choose settings, mark **Ready** in both, then let the host start. Development uses a frontend on port 5173 and backend on port 3001. No credentials are needed locally.

The default setup is Mixed Game, 10 questions, 30 seconds, all six standard packs. Spicy (18+) and Dark humor are off by default. Choose 5/10/15/20 questions, 15/30/60 seconds or no answer limit. Evaluations always have their own 30-second limit. Everyone answers at once; there are no individual turns.

For optional overrides, copy `.env.example` to `.env`. Localhost is for testing on the same computer; different devices require a backend and frontend reachable from both devices with matching allowed origins. Production uses HTTPS.

## Commands

| Command                      | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `npm run dev`                | Both development servers                                  |
| `npm run build`              | Validate questions, typecheck, build frontend and backend |
| `npm start`                  | Start the compiled backend (after build)                  |
| `npm run typecheck`          | Strict TypeScript checks                                  |
| `npm run format`             | Format source and documentation                           |
| `npm run format:check`       | Check formatting                                          |
| `npm test`                   | Engine and real two-client Socket.IO tests                |
| `npm run test:e2e`           | Browser game and responsive verification                  |
| `npm run validate:questions` | Validate the JSON question bank                           |
| `npm run catalog`            | Regenerate `questions/CATALOG.md` from JSON               |

Browser tests use installed Microsoft Edge on Windows. On Linux/macOS first run `npx playwright install chromium`. Tests start local servers and use independent browser contexts. Screenshots go to ignored `qa/`; failure traces go to ignored `test-results/`.

## The four modes

| Mode               | Answer together                                           | Evaluation / shared points                                         |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Who's Most Likely? | Pick a player's ID                                        | Same pick: 1; different: 0                                         |
| This or That       | Pick option a or b                                        | Same pick: 1; different: 0                                         |
| Convince Me        | Both write up to 500 characters                           | Judge only the other answer: two positive votes 1; one 0.5; none 0 |
| Guess Your Partner | The target writes their answer while the partner predicts | Target alone judges Correct 1 / Close enough 0.5 / Nope 0          |

Guess targets alternate between rounds **of that mode**. Both players still write simultaneously. Answers are locked on submit; drafts are never sent automatically. Reveals happen only after both submissions or the server deadline. Evaluations remain secret until their phase closes. Either player can request Skip, but both must confirm while the answering phase remains open. Both must Continue before the next question.

**Sync score = total shared points from complete rounds ÷ complete rounds × 100**, rounded to the nearest whole percent for display. Missing answers or required evaluations produce an incomplete round, never an invented negative vote. Incomplete and skipped rounds have separate counters and are excluded from the denominator. With no complete rounds the result is **No score this time**. This is entertainment, not a scientific compatibility score or relationship assessment.

## Optional question packs

Choose **Spicy (18+)** for flirty adult questions or **Dark humor** for morbid, fictional dilemmas. Each optional pack adds 40 questions, ten per mode. The host can select either pack independently, combine them with the standard packs, or play only an optional pack. “All standard packs” changes only the six standard selections and preserves any explicitly selected optional packs. Both players see the selection, and changing it resets both Ready states.

New rooms always start with the standard packs only (200 questions). Each optional pack alone supports up to ten rounds in a single mode; select both or add standard packs for longer games. Mixed mode has 40 questions available per optional pack. The lobby shows the actual count and blocks a game if the selection is too small. Room questions remain a separate, host-authored selection.

## Questions and room questions

The four JSON files in [`questions/`](questions/README.md) are the only built-in source of truth. See the editing guide for complete examples, stable IDs, validation, and publishing. The [generated catalog](questions/CATALOG.md) is a readable index of all questions. Never put secrets in this public repository.

The host can add, edit, or delete up to 20 temporary questions in the lobby (Most Likely, This or That, Convince Me). Eligible room questions take priority in the selected count; excess blocks starting. Pack filters affect only the bank. Custom questions and settings changes reset everyone's Ready state. Temporary questions disappear when the room closes.

## Project structure

```text
client/        React UI, original SVG artwork, local font assets
server/        Socket.IO boundary, authoritative engine, bank loader
shared/        Protocol types, modes, settings and question validation
questions/     Four ordered JSON banks, editing guide, generated catalog
scripts/       Catalog validation and optional Cloud Run deployment
tests/         Engine, Socket.IO integration and browser tests
docs/          Architecture, deployment and verification notes
```

## Rooms are temporary

There are at most **five rooms per server process** and two players per room. Room codes do not reclaim occupied seats; a random per-seat reconnect token is kept in `sessionStorage` for that tab. Only the display name is remembered in `localStorage`. Invite links contain the room code only.

A disconnect pauses the game clock for up to 60 seconds. Returning restores the same seat and a private snapshot. A duplicate connection for the same token replaces the older connection explicitly. After the grace period, the missing seat is released, the remaining player returns to the lobby, and host transfers if needed. Leaving does this immediately. Room questions survive while someone remains. Empty rooms expire after grace; rooms without a successful game action for two hours expire, even if a forgotten tab remains open. Background state sync does not extend this TTL.

Restarts and deployments erase all rooms. The app handles a missing room and offers a fresh start. No persistence is promised.

## Deploy separately

1. **Backend / Cloud Run:** follow [deployment instructions](docs/deployment.md). A prepared Dockerfile and PowerShell script deploy the separate `heart-sync` service, only after authorization to create billable resources and after all active players leave.
2. **Frontend / GitHub Pages:** set repository variable `VITE_SERVER_URL` to that public backend URL, choose **GitHub Actions** in Settings → Pages, and run the prepared workflow. The real repository base is `/Heart-Sync/`; invite links use `?room=...` and need no SPA path rewrites.

The frontend receives only a public server URL, never Google credentials. Preparing these files does not deploy anything. See [architecture](docs/architecture.md) for timing, privacy and failure boundaries, and [verification](docs/verification.md) for the actual local checks and remaining deployment steps.

## License and assets

Original project code, question seed and SVG/CSS artwork: [MIT](LICENSE), copyright 2026 wzzzodiac. Fonts are bundled locally under SIL OFL 1.1. See [third-party notices](docs/third-party-notices.md); full font licenses also ship in `client/public/licenses/`. Dependency licenses remain in their packages. No exclusivity is claimed over everyday questions, mechanics, or the Heart Sync name.
