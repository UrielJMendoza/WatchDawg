# WatchDawg — GCP + Workload Identity Federation Setup

One-time runbook for provisioning the Google Cloud side of the WatchDawg
deploy pipeline. A new engineer should be able to reproduce the entire
deploy in under 60 minutes using only this document.

**No long-lived service-account JSON keys. Ever.** Authentication is
Workload Identity Federation — GitHub Actions swaps its OIDC token for
short-lived Google credentials scoped to one service account with one
set of IAM roles.

---

## Prerequisites

- `gcloud` CLI v450+ installed and logged in (`gcloud auth login`)
- Your GitHub org + repo path (`jeramiahmm/watchdawg` in this repo)
- Billing enabled on a new or existing GCP project
- Admin privileges on the target project

---

## Variables (set once, reuse below)

```bash
export PROJECT_ID="watchdawg-prod"                     # unique across all of GCP
export REGION="us-central1"
export GITHUB_ORG="jeramiahmm"
export GITHUB_REPO="watchdawg"
export POOL_ID="watchdawg-github-pool"
export PROVIDER_ID="watchdawg-github-provider"
export DEPLOY_SA_NAME="watchdawg-deployer"
```

---

## 1. Create the project and enable APIs

```bash
gcloud projects create "$PROJECT_ID" \
    --name="WatchDawg Production" \
    --labels="app=watchdawg,phase=prod"

gcloud config set project "$PROJECT_ID"

# Link billing (replace with your billing account id)
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    iamcredentials.googleapis.com \
    cloudbuild.googleapis.com \
    cloudresourcemanager.googleapis.com \
    iam.googleapis.com \
    sts.googleapis.com
```

---

## 2. Artifact Registry — Docker repo

```bash
gcloud artifacts repositories create watchdawg \
    --repository-format=docker \
    --location="$REGION" \
    --description="WatchDawg container images"
```

---

## 3. Deploy service account

```bash
gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
    --display-name="WatchDawg GitHub Deployer"

export DEPLOY_SA_EMAIL="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Minimum roles needed to build + push images and roll Cloud Run revisions.
for role in \
    roles/run.admin \
    roles/artifactregistry.writer \
    roles/iam.serviceAccountUser \
    roles/secretmanager.secretAccessor; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
        --role="$role"
done
```

---

## 4. Workload Identity Federation — pool + provider

```bash
# The pool is the trust boundary; the provider is the specific OIDC issuer.
gcloud iam workload-identity-pools create "$POOL_ID" \
    --location="global" \
    --display-name="WatchDawg GitHub Actions Pool"

export POOL_RESOURCE=$(gcloud iam workload-identity-pools describe "$POOL_ID" \
    --location="global" --format="value(name)")

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GITHUB_ORG}/${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"

export PROVIDER_RESOURCE=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --location="global" --workload-identity-pool="$POOL_ID" --format="value(name)")
```

> **Important.** The `attribute-condition` above restricts token exchange
> to pushes on `main` of the exact repo. A malicious fork or another
> branch cannot exchange its OIDC token for Google credentials.

Bind the pool's principal set to the deploy service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"
```

---

## 5. Secret Manager

Create each secret and grant read to the deploy SA. Placeholder values
are fine at bootstrap — fill in the real ones before the first deploy.

```bash
create_secret () {
    local name="$1"
    local value="$2"
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
    gcloud secrets add-iam-policy-binding "$name" \
        --role="roles/secretmanager.secretAccessor" \
        --member="serviceAccount:${DEPLOY_SA_EMAIL}"
}

# Placeholders — replace with real values before first deploy.
create_secret supabase-url              "https://REPLACE.supabase.co"
create_secret supabase-service-role-key "REPLACE"
create_secret supabase-anon-key         "REPLACE"
create_secret supabase-jwt-secret       "REPLACE"
create_secret cron-secret               "$(openssl rand -hex 24)"
create_secret sentry-dsn                "REPLACE"
```

Update any secret without rotating its GCP name (new version, old CLI refs keep working):

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add <secret-name> --data-file=-
```

---

## 6. GitHub → GCP: what to paste into GitHub

Open `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/settings/variables/actions`
and add **repository variables** (NOT secrets — these are not secret):

| Variable                | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`        | `$PROJECT_ID`                                                            |
| `GCP_REGION`            | `us-central1`                                                            |
| `GCP_DEPLOY_SA_EMAIL`   | `$DEPLOY_SA_EMAIL` (from step 3)                                         |
| `GCP_WIF_PROVIDER`      | `$PROVIDER_RESOURCE` (prints as `projects/.../providers/...`)            |
| `ALLOWED_ORIGINS`       | e.g. `https://watchdawg.vercel.app,https://watchdawg-prod.vercel.app`    |

No JSON keys. No `GCP_SA_KEY` secret. Ever.

---

## 7. First deploy

Push to `main` (or run the `deploy-api` workflow manually from the Actions
tab). Expected log lines:

```
✓ Auth to GCP via WIF
✓ Build and push image (linux/amd64)
✓ Deploy to Cloud Run
✓ Smoke test /health  → 200
```

Grab the Cloud Run URL:

```bash
gcloud run services describe watchdawg-api \
    --region="$REGION" --format='value(status.url)'
```

Add that URL to `ALLOWED_ORIGINS` in Vercel's env vars (frontend) and
re-paste it into the repo-level `ALLOWED_ORIGINS` variable too, then
re-run the deploy so Cloud Run picks it up.

---

## 8. Verifying the trust boundary

Run this from any repo that is **not** `${GITHUB_ORG}/${GITHUB_REPO}`:

```bash
gh workflow run deploy-api --repo <some-other-repo>
```

The `Auth to GCP via WIF` step should fail with:

```
denied: failed to generate Google access token
```

Because the attribute-condition in step 4 rejects every assertion that
doesn't come from our repo on main. If that test *succeeds*, the
attribute-condition is too loose — re-run step 4.

---

## Teardown

```bash
gcloud run services delete watchdawg-api --region="$REGION" --quiet
gcloud artifacts repositories delete watchdawg --location="$REGION" --quiet
gcloud iam workload-identity-pools delete "$POOL_ID" --location=global --quiet
gcloud iam service-accounts delete "$DEPLOY_SA_EMAIL" --quiet
for s in supabase-url supabase-service-role-key supabase-anon-key supabase-jwt-secret cron-secret sentry-dsn; do
    gcloud secrets delete "$s" --quiet
done
gcloud projects delete "$PROJECT_ID" --quiet
```
