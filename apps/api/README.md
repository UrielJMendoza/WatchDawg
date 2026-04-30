# WatchDawg API

FastAPI backend deployed to Google Cloud Run (`us-central1`, always-free tier).

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Fill in SUPABASE_* and CRON_SECRET at minimum.
uvicorn watchdawg_api.main:app --reload --port 8000
```

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/db
curl http://localhost:8000/events
```

## Run tests

```bash
pytest -q
```

## Build the Docker image

```bash
docker build -t watchdawg-api .
docker run --rm -p 8080:8080 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  watchdawg-api
```

## Cloud Run — one-time setup

The deploy workflow (`.github/workflows/deploy-api.yml`) authenticates to GCP
via **Workload Identity Federation** so no long-lived service-account keys
are stored in GitHub.

### 1. Create the GCP resources

Replace `PROJECT_ID` and `GH_USER/REPO` with your values.

```bash
gcloud config set project PROJECT_ID

# Enable APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  secretmanager.googleapis.com

# Artifact Registry repo
gcloud artifacts repositories create watchdawg \
  --repository-format=docker \
  --location=us-central1

# Service account that the GitHub Action will impersonate
gcloud iam service-accounts create gh-deploy \
  --display-name "GitHub Actions deploy"

DEPLOY_SA=gh-deploy@PROJECT_ID.iam.gserviceaccount.com

# Roles for the SA
for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor ; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:$DEPLOY_SA" \
    --role="$role"
done

# Workload Identity pool + provider for GitHub
gcloud iam workload-identity-pools create github-pool \
  --location=global

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Actions" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="attribute.repository == 'GH_USER/REPO'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/GH_USER/REPO"
```

### 2. Store secrets in Secret Manager

```bash
echo -n "<service role key>" | gcloud secrets create supabase-service-role --data-file=-
echo -n "<anon key>"          | gcloud secrets create supabase-anon-key      --data-file=-
echo -n "<https://...>"       | gcloud secrets create supabase-url           --data-file=-
echo -n "<sk-ant-...>"         | gcloud secrets create anthropic-key          --data-file=-
echo -n "<random 48 chars>"    | gcloud secrets create cron-secret            --data-file=-

# Phase 2 onward — create empty stubs so the deploy doesn't fail:
for s in aisstream-key newsdata-key opensky-client-id opensky-client-secret \
         reddit-client-id reddit-client-secret ; do
  printf "" | gcloud secrets create "$s" --data-file=- || true
done
```

### 3. Set GitHub repo variables + secrets

| Where    | Name                | Value                                                        |
|----------|---------------------|--------------------------------------------------------------|
| Variable | `GCP_PROJECT_ID`    | your project id                                              |
| Variable | `GCP_WIF_PROVIDER`  | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| Variable | `GCP_DEPLOY_SA`     | `gh-deploy@PROJECT_ID.iam.gserviceaccount.com`               |
| Variable | `GCP_REGION`        | `us-central1`                                                 |
| Variable | `GCP_AR_REPO`       | `watchdawg`                                                   |
| Variable | `ALLOWED_ORIGINS`   | `https://watchdawg-<your>.vercel.app,http://localhost:3000`  |

### 4. Push to `main`

The first push to `main` builds the image, pushes to Artifact Registry, and
deploys the Cloud Run service `watchdawg-api`. The workflow prints the
service URL — paste it into Vercel as `NEXT_PUBLIC_API_BASE_URL` and redeploy.

## Smoke test the live deployment

```bash
curl -fsSL https://watchdawg-api-xxxx-uc.a.run.app/health
# {"status":"ok","version":"0.1.0","time":"..."}
```
