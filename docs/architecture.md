# Architecture

One React frontend and one Node/Socket.IO backend serve all four modes. The engine has one common round lifecycle; small mode branches validate answers, decide permitted voters, and calculate points. The server, not a browser, owns identity, room capacity, selection, roles, phase transitions, time, results and commentary.

## State machine

```text
lobby → countdown (3s) → answering → evaluating (30s, if needed)
                              ↘             ↙
                                round_result → countdown / finished
finished → lobby (fresh Ready required)
any occupied phase → paused → saved phase OR lobby after grace
```

Both answers are independently writable during the same answering phase. Choice modes go directly to a result, where answers are revealed. Text modes expose answers on entry into evaluating. An incomplete answer phase reveals available answers and goes to result without evaluation. Pending evaluations stay private until round_result. Continue is a set of player IDs; only both connected players can advance. Returning to the lobby or replaying never starts a new game automatically.

Each command carries a request UUID, round ID and phase ID. The authenticated socket maps to a seat; client-supplied names and player IDs cannot authorize actions. Host, phase, round, values, length and membership checks run on the server. Every accepted answer/evaluation is immutable, independent of request-ID retry caching. Old phase events cannot advance a new round. Ready is invalidated by configuration and custom edits. A deliberate return to lobby can be requested by either player after final results.

## Time, races and reconnect

Snapshots contain `serverNow`, `roundId`, `phaseId`, and `deadlineAt`. The UI anchors the received server clock to `performance.now()` and refreshes on state changes, a 15-second sync, tab visibility and network recovery. Network delay can make its estimate slightly late; the server has final authority. Countdown and evaluation use separate deadlines; no-limit applies only to answers.

The engine handles commands synchronously in one event loop. It processes expired deadlines **before** any incoming command or disconnect. At the exact deadline, timeout wins. Otherwise first accepted events win: two answers close the answer phase; two skip confirmations cancel it; whichever barrier closes first prevents the other. A single skip request does not block answering. A disconnect first settles deadlines, then freezes the remaining phase duration. Invalid or stale events cannot reset the clock.

The pause keeps the phase ID, immutable answers, votes and remaining milliseconds. It resumes once all occupied seats reconnect, preserving valid in-flight actions. Each seat has its own 60-second grace deadline. At grace expiry, missing players are removed and the game is cancelled into the lobby, with custom questions retained. An empty room is deleted. One 100ms server sweep manages deadlines and cleanup; there are no per-room timers to leak. A two-hour idle TTL is measured from successful gameplay/admission actions, excluding sync and retries.

Successful commands have bounded idempotency caches (200 per socket, plus 200 per seat for gameplay across reconnects). Cache entries match the complete request, not just its ID. The browser retries an unacknowledged command up to three times with the same ID. Snapshots are the authoritative confirmation after a network loss. A completely lost create ACK can leave an unused room reserved until its disconnect grace; create does not use a room code as a recovery credential.

## Private snapshots and limits

`snapshot(room, player)` explicitly constructs each outbound object. Prior to reveal there is no shared answers map, no pending votes map, no result, and no current round history entry. Each player can see their **own** submitted answer/evaluation and both players' submission flags. Reconnection uses the same serializer. Upcoming deck contents and seat tokens never appear in room snapshots. Admission ACKs return a token only to the requesting socket. Shared history contains only closed rounds. Server-selected comments are saved once per result.

Names are trimmed and limited to 24 characters. Duplicate names receive Player 1 / Player 2 labels. Secure random six-character codes use `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, with collision checks. Random 256-bit tokens reclaim a seat; code alone never does. Duplicate authenticated connections replace the older socket with an explicit notice. Production requires an origin allowlist for both CORS and the WebSocket handshake. Names, answers and questions render as React text, never HTML. Normal logs contain no answers, codes or tokens.

Socket.IO payloads are limited to 32 KiB, each socket to 25 commands/second, and room admission to 30 attempts/minute per transport address. Idle unauthenticated sockets close after 15 seconds. Forwarded IP headers are deliberately not trusted: behind a proxy the address limiter can be shared by users. This is a small casual-game limit, not a claim of full DDoS protection. Application rate limits are process-local. Deployment on a public origin is not account-based authentication.

## Questions and score

The bank is validated before listening. The host's eligible custom questions reserve slots first; then the server repeatedly chooses a mode with the smallest current count among modes with eligible remaining bank questions. The final selected deck is securely shuffled once. No IDs repeat within a game. Mixed mode has a maximum count difference of one while pools permit it. Mandatory custom questions can themselves force an imbalance; they are never silently dropped to restore balance. Pack filters cannot remove room questions. Not enough available questions or too many eligible custom questions blocks starting.

Complete rounds alone contribute to the percentage. Results carry status, points, answers and votes; the statistics are derived from that closed history, so retransmitting an event cannot award points again. Mode details show matches, positive votes, full guesses and partial guesses. Guess targets alternate only when a guess round is created, with a maximum one-round imbalance.

## Operational boundary

There is no shared store: the five-room cap is per process. Cloud Run uses service-level max 1, one revision receiving traffic, min 0, concurrency 40 and a 3600-second request timeout. Even those settings cannot guarantee a global singleton or uninterrupted rooms. Restarts lose memory; WebSockets reconnect; affinity is best effort; scaling can briefly exceed the configured maximum. Strict global limits, multi-instance support or durability require coordinated external state. This V1 intentionally does not add Redis.
