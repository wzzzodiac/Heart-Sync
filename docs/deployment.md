# Deployment

Prepared for the existing public repository **wzzzodiac/Heart-Sync**. Local verification does not publish GitHub commits, activate Pages, or create a Google Cloud service.

## 1. Backend: Cloud Run

Before running deployment you need explicit owner approval for billable resources, a Google Cloud project with billing, an authenticated Google Cloud CLI, Cloud Run / Cloud Build / Artifact Registry APIs enabled, and the necessary deploy/build/service-account permissions. Do not borrow another game's service or credentials. Stop all Heart Sync sessions before deployment; an in-memory room cannot be migrated.

From the repository root in PowerShell, after those prerequisites:

```powershell
.\scripts\deploy-cloud-run.ps1 -ProjectId YOUR_PROJECT_ID -Region europe-west1 -ConfirmNoActiveRooms
```

`YOUR_PROJECT_ID` is a placeholder, not a configured project. The script builds from this project's Dockerfile and deploys the separate **heart-sync** service. Region is configurable. It uses these verified CLI settings:

| Setting                   | Value                                         | Why                                               |
| ------------------------- | --------------------------------------------- | ------------------------------------------------- |
| `--max`                   | `1`                                           | Service-level maximum instances                   |
| `--min`                   | `0`                                           | No permanently requested warm instance            |
| `--concurrency`           | `40`                                          | Room for ten players and health/reconnect traffic |
| `--timeout`               | `3600`                                        | Maximum one-hour WebSocket request lifetime       |
| `--session-affinity`      | enabled                                       | Best effort only; no persistence guarantee        |
| `--allow-unauthenticated` | enabled                                       | Public game endpoint, no Google login             |
| environment               | `NODE_ENV=production`                         | Require an explicit browser-origin allowlist      |
| environment               | `ALLOWED_ORIGINS=https://wzzzodiac.github.io` | Origin only; no repository path                   |

It then sends **100% of traffic to the latest revision**, using `gcloud run services update-traffic heart-sync --to-latest`. Do not keep another revision tagged for direct gameplay access or split traffic across revisions. No existing unrelated Cloud Run service is inspected or modified. The container listens on `0.0.0.0:$PORT`; `GET /health` returns only `{"ok":true}`.

The maximum can briefly be exceeded by Cloud Run. A one-instance setting is not an infallible distributed lock. The five-room limit is per process, not a guaranteed global limit. Session affinity does not preserve memory across restarts. Deployments and restarts erase rooms, and a WebSocket reconnect may reach a different instance. The UI reports room/session unavailability and can create a new room. Coordinated external storage is necessary for strict global limits or durability.

Open WebSockets can incur charges. Min 0 is not a promise of zero cost. The client does not open a socket on Home and disconnects after leaving. Forgotten room connections are cleaned up by application TTL. Do not enable a deployment while an active session needs preserving.

After deployment, save the reported HTTPS URL, open its `/health` endpoint, and verify the service's traffic and scaling settings. Docker and Cloud Run runtime behavior still need a real deployment check; neither is implied by local TypeScript or browser tests.

## 2. Frontend: GitHub Pages

1. Push the reviewed source only when publication is authorized.
2. In **Settings → Secrets and variables → Actions → Variables**, create `VITE_SERVER_URL` containing the public Heart Sync backend URL (for example `https://YOUR-HEART-SYNC-SERVICE.run.app`). It is public configuration, not a secret. No Google key belongs in Vite variables.
3. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
4. Run **Publish frontend to GitHub Pages**, or push an approved update to `main`. The workflow fails with a clear message if the backend URL is missing.
5. Open `https://wzzzodiac.github.io/Heart-Sync/` after a successful workflow. This is the expected URL, **not a claim that it is already live**.
6. Test creating/joining from two physical devices and refresh an invite such as `/Heart-Sync/?room=ABC234`. The page uses a query parameter; there is no nested route requiring a 404 fallback.

Vite base is set to `/Heart-Sync/` with the repository's actual letter case. The deploy workflow builds and tests before uploading only `dist/client`. Source JSON changes also require a new **backend** deployment, because selection runs on the server; publishing only the frontend will not update the active bank.

For a custom domain, adjust Vite's base and the backend's exact `ALLOWED_ORIGINS` value together. Allowed origins may be comma-separated when running the server directly. The prepared script accepts a single HTTPS frontend origin.

## Local production build check

```sh
npm ci
npm run build
npm start
```

The compiled backend still loads `questions/` relative to the repository root. The Docker image copies that directory explicitly. For a Pages-style frontend build in PowerShell:

```powershell
$env:VITE_BASE_PATH = '/Heart-Sync/'
$env:VITE_SERVER_URL = 'https://YOUR-HEART-SYNC-SERVICE.run.app'
npm run build
```

Never use the example URL as an actual deployment setting. Local development defaults need no environment file.

## Official references checked on 2026-10-03

- [Cloud Run maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances): service-level `--max` and its limitations.
- [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets): timeouts, reconnection, affinity, state and billing considerations.
- [gcloud run deploy](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy): scaling, concurrency, timeout, origin environment and source deployment flags.
- [Vite static deployment](https://vite.dev/guide/static-deploy): repository base path and GitHub Pages Actions flow.
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/): acknowledgements, retries, and application-level deduplication.
