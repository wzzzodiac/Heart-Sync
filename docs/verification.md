# Verification record

Local verification on **2026-10-03**, using Node 24.21.0, npm 11.19.0 and installed Microsoft Edge through Playwright. The implementation is on the local `codex/heart-sync-v1` branch of the cloned `wzzzodiac/Heart-Sync` repository.

## Passed

- `npm run build`: strict TypeScript checks, Vite production bundle, compiled Node backend and bank validation.
- `npm run format:check`: consistent source/documentation formatting.
- `npm run validate:questions`: 120 unique valid records, 30 per mode. A separate exact comparison with the supplied TXT confirmed all 120 IDs, packs, texts and option texts match the seed. Import examples 031 were excluded.
- `npm run catalog`: generated catalog from the JSON source.
- `npm test`: **19 passing tests** covering Ready/host barriers, both choice modes, simultaneous text, private snapshots, vote secrecy, reconnection, all guess scores, target alternation, missing answers/evaluations, no-limit answering, skip consensus, fixed game length, replay, duplicate/old events, invalid input and authority, Mixed distribution, shortage, room capacity, custom isolation/validation, host transfer, grace and TTL cleanup.
- The integration tests use real Socket.IO connections from independent clients, including a replacement reconnect socket. They also verify the health response and rejection of an unapproved Origin. Local WebSocket tests required execution outside the restricted network sandbox.
- `npm run test:e2e`: **one complete passing browser scenario** with two independent contexts. Home → create/join → settings/custom question → Ready → five mixed rounds containing all four modes → results → replay lobby → leave. It asserts equal shared questions, secret reveal boundaries, refresh/reconnect during a secret answer, both-player Continue, fresh Ready on replay, and no uncaught browser errors.
- Responsive screenshots and horizontal-overflow assertions at **360, 390, 768, 1440 and 1920 px** for Home, lobby, question and results. Entry/reveal also captured on mobile and desktop. The actual captures were inspected; a mobile room-code alignment issue was fixed and the scenario rerun.
- A separate Vite build with `VITE_BASE_PATH=/Heart-Sync/` confirmed repository-prefixed script, style and font URLs. It used a local backend URL for inspection, not a fictional cloud endpoint.
- PowerShell deployment script parsed successfully without executing deployment.
- Dependency installation reported no known vulnerabilities at installation time. This is not a security-audit guarantee.

Screenshots are in ignored `qa/`, including `home-1440.png`, `home-390.png`, `lobby-360.png`, `question-390.png`, `reveal-desktop.png` and `results-1440.png`. Playwright regenerates them. They contain only disposable test-room data, not reconnect tokens.

## Not performed / remaining

- **No GitHub push, merge, Pages activation or external deployment.** Publication remains subject to the owner's authorization in the supplied prompt. The repository was initially empty.
- No Google Cloud project ID, deployment authorization or real backend URL was supplied. The local shell did not expose `gcloud`. Cloud CLI authentication, billing and required IAM/API setup must be supplied/verified before deployment.
- No Docker engine was exposed in this local shell, so the Dockerfile was prepared but **not built or run**. The underlying server TypeScript build was verified locally; that does not establish a container-runtime result.
- Cloud Run reconnects, scale-to-zero, one-hour request expiry, billing and Pages workflow execution have not been tested on a live deployment. After backend deployment, set `VITE_SERVER_URL`, enable Pages Actions, publish, then test from two real devices.
- Browser checks used desktop Edge with resized viewports, not physical phones. Native iOS/Android keyboard behavior, background suspension and cross-browser Safari/Firefox behavior remain unverified. The UI uses normal document flow, multiline text fields, focus styles and reduced-motion rules; that is not a claim of physical-device or comprehensive accessibility certification.

No other game repository or cloud service was modified. The reference image was used for visual direction; original vector artwork and local OFL fonts are shipped instead of embedding the reference image.
