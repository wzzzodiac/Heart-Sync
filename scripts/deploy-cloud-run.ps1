param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$Region = 'europe-west1',
  [string]$FrontendOrigin = 'https://wzzzodiac.github.io',
  [switch]$ConfirmNoActiveRooms
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmNoActiveRooms) { throw 'Deployment loses in-memory rooms. Retry with -ConfirmNoActiveRooms only after everyone has left.' }
if ($ProjectId -match '[<>]' -or $ProjectId -notmatch '^[a-z][a-z0-9-]{4,61}[a-z0-9]$') { throw 'Provide your real Google Cloud project ID.' }
if ($FrontendOrigin -notmatch '^https://[^/,\s]+$') { throw 'Provide an HTTPS origin without a path or trailing slash.' }
# Run only after the owner authorizes billable deployment and prepares the project.
# This is a separate service. It never reads or changes any other game's service.
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  & gcloud run deploy heart-sync --source . --project $ProjectId --region $Region --allow-unauthenticated --max 1 --min 0 --concurrency 40 --timeout 3600 --session-affinity --set-env-vars "NODE_ENV=production,ALLOWED_ORIGINS=$FrontendOrigin"
  if ($LASTEXITCODE -ne 0) { throw 'Cloud Run deployment failed.' }
  & gcloud run services update-traffic heart-sync --project $ProjectId --region $Region --to-latest
  if ($LASTEXITCODE -ne 0) { throw 'Could not put all traffic on the latest revision. Inspect the service before playing.' }
  & gcloud run services describe heart-sync --project $ProjectId --region $Region --format 'value(status.url)'
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the service URL.' }
} finally { Pop-Location }
