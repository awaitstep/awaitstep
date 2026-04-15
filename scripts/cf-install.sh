#!/usr/bin/env bash
set -euo pipefail

echo "AwaitStep — Cloudflare Workers Install"
echo "======================================="
echo ""

# ── Prerequisites ──────────────────────────────────────

if ! command -v wrangler &>/dev/null; then
  echo "Error: wrangler CLI is not installed."
  echo "Install it with: npm i -g wrangler"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "Error: pnpm is not installed."
  echo "Install it with: npm i -g pnpm"
  exit 1
fi

if ! wrangler whoami &>/dev/null 2>&1; then
  echo "Error: Not logged in to Cloudflare."
  echo "Run: wrangler login"
  exit 1
fi

echo "Prerequisites OK"
echo ""

# ── Project root detection ─────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"

if [ ! -f "$API_DIR/wrangler.jsonc" ] || [ ! -f "$WEB_DIR/wrangler.jsonc" ]; then
  echo "Error: Cannot find wrangler.jsonc files."
  echo "Run this script from the project root: ./scripts/cf-install.sh"
  exit 1
fi

# ── Configuration prompts ──────────────────────────────

echo "Configure your AwaitStep instance:"
echo ""

# Worker name prefix (affects URLs)
read -rp "Worker name prefix [awaitstep]: " WORKER_PREFIX
WORKER_PREFIX="${WORKER_PREFIX:-awaitstep}"

# Email (Resend)
read -rp "Resend API key (for magic link emails, optional): " RESEND_API_KEY

# OAuth providers
echo ""
echo "OAuth providers (optional, press Enter to skip):"
read -rp "  GitHub Client ID: " GITHUB_CLIENT_ID
read -rp "  GitHub Client Secret: " GITHUB_CLIENT_SECRET
read -rp "  Google Client ID: " GOOGLE_CLIENT_ID
read -rp "  Google Client Secret: " GOOGLE_CLIENT_SECRET

echo ""

# ── Build ──────────────────────────────────────────────

echo "Installing dependencies and building..."
cd "$ROOT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build
echo ""

# ── Create D1 database ─────────────────────────────────

echo "Creating D1 database..."
cd "$API_DIR"

D1_OUTPUT=$(pnpm exec wrangler d1 create "${WORKER_PREFIX}" 2>&1) || true
D1_ID=$(echo "$D1_OUTPUT" | grep -o '"[0-9a-f-]\{36\}"' | tr -d '"' | head -1)

if [ -z "$D1_ID" ]; then
  # Database might already exist — try to list it
  D1_ID=$(pnpm exec wrangler d1 list --json 2>/dev/null | grep -B2 "\"${WORKER_PREFIX}\"" | grep '"uuid"' | grep -o '[0-9a-f-]\{36\}' | head -1) || true
fi

if [ -z "$D1_ID" ]; then
  echo "Error: Failed to create or find D1 database."
  echo "Create it manually: cd apps/api && pnpm exec wrangler d1 create ${WORKER_PREFIX}"
  exit 1
fi

echo "D1 database: ${WORKER_PREFIX} (${D1_ID})"

# ── Patch wrangler configs ─────────────────────────────

# API: set D1 database_id and worker name
sed -i.bak "s|__D1_DATABASE_ID__|${D1_ID}|g" "$API_DIR/wrangler.jsonc"
sed -i.bak "s|\"awaitstep-api\"|\"${WORKER_PREFIX}-api\"|g" "$API_DIR/wrangler.jsonc"
sed -i.bak "s|\"awaitstep\"|\"${WORKER_PREFIX}\"|g" "$API_DIR/wrangler.jsonc"
rm -f "$API_DIR/wrangler.jsonc.bak"

# Web: set worker name and service binding reference
sed -i.bak "s|\"awaitstep-web\"|\"${WORKER_PREFIX}-web\"|g" "$WEB_DIR/wrangler.jsonc"
sed -i.bak "s|\"awaitstep-api\"|\"${WORKER_PREFIX}-api\"|g" "$WEB_DIR/wrangler.jsonc"
rm -f "$WEB_DIR/wrangler.jsonc.bak"

echo "Patched wrangler configs"

# ── Apply D1 migrations ───────────────────────────────

echo "Applying D1 migrations..."
pnpm exec wrangler d1 migrations apply "${WORKER_PREFIX}" --remote
echo ""

# ── Generate and set secrets ───────────────────────────

TOKEN_KEY=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

echo "Setting API Worker secrets..."
echo "$TOKEN_KEY" | pnpm exec wrangler secret put TOKEN_ENCRYPTION_KEY 2>/dev/null
echo "$AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET 2>/dev/null

if [ -n "$RESEND_API_KEY" ]; then
  echo "$RESEND_API_KEY" | pnpm exec wrangler secret put RESEND_API_KEY 2>/dev/null
fi

if [ -n "$GITHUB_CLIENT_ID" ]; then
  echo "$GITHUB_CLIENT_ID" | pnpm exec wrangler secret put GITHUB_CLIENT_ID 2>/dev/null
  echo "$GITHUB_CLIENT_SECRET" | pnpm exec wrangler secret put GITHUB_CLIENT_SECRET 2>/dev/null
fi

if [ -n "$GOOGLE_CLIENT_ID" ]; then
  echo "$GOOGLE_CLIENT_ID" | pnpm exec wrangler secret put GOOGLE_CLIENT_ID 2>/dev/null
  echo "$GOOGLE_CLIENT_SECRET" | pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET 2>/dev/null
fi

echo ""

# ── Deploy API Worker ──────────────────────────────────

echo "Deploying API Worker..."
pnpm exec wrangler deploy

API_URL=$(pnpm exec wrangler deployments list --limit=1 2>&1 | grep -o 'https://[^ ]*\.workers\.dev' | head -1)

if [ -z "$API_URL" ]; then
  # Fallback: construct from worker name and account subdomain
  API_URL="https://${WORKER_PREFIX}-api.workers.dev"
  echo "Warning: Could not auto-detect API URL. Using: $API_URL"
  echo "If incorrect, update apps/web/wrangler.jsonc manually."
fi

echo "API Worker deployed: $API_URL"
echo ""

# ── Set CORS_ORIGIN on API ─────────────────────────────

# We'll set this after deploying the web worker, once we know its URL

# ── Deploy Web Worker ──────────────────────────────────

echo "Deploying Web Worker..."
cd "$WEB_DIR"

# Patch API_URL into web config
sed -i.bak "s|__API_WORKER_URL__|${API_URL}|g" "$WEB_DIR/wrangler.jsonc"
rm -f "$WEB_DIR/wrangler.jsonc.bak"

# Patch auth method flags based on user config
if [ -z "$RESEND_API_KEY" ]; then
  sed -i.bak 's|"MAGIC_LINK_ENABLED": "true"|"MAGIC_LINK_ENABLED": "false"|g' "$WEB_DIR/wrangler.jsonc"
  rm -f "$WEB_DIR/wrangler.jsonc.bak"
fi
if [ -n "$GITHUB_CLIENT_ID" ]; then
  sed -i.bak 's|"GITHUB_ENABLED": "false"|"GITHUB_ENABLED": "true"|g' "$WEB_DIR/wrangler.jsonc"
  rm -f "$WEB_DIR/wrangler.jsonc.bak"
fi
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  sed -i.bak 's|"GOOGLE_ENABLED": "false"|"GOOGLE_ENABLED": "true"|g' "$WEB_DIR/wrangler.jsonc"
  rm -f "$WEB_DIR/wrangler.jsonc.bak"
fi

BUILD_TARGET=cf pnpm build
pnpm exec wrangler deploy

WEB_URL=$(pnpm exec wrangler deployments list --limit=1 2>&1 | grep -o 'https://[^ ]*\.workers\.dev' | head -1)

if [ -z "$WEB_URL" ]; then
  WEB_URL="https://${WORKER_PREFIX}-web.workers.dev"
  echo "Warning: Could not auto-detect Web URL. Using: $WEB_URL"
fi

echo "Web Worker deployed: $WEB_URL"
echo ""

# ── Set CORS_ORIGIN on API (now that we know the web URL) ──

echo "Setting CORS_ORIGIN on API Worker..."
cd "$API_DIR"
echo "$WEB_URL" | pnpm exec wrangler secret put CORS_ORIGIN 2>/dev/null
echo ""

# ── Summary ────────────────────────────────────────────

echo "======================================="
echo "AwaitStep is running on Cloudflare!"
echo ""
echo "  Web:  $WEB_URL"
echo "  API:  $API_URL"
echo ""
echo "Commands:"
echo "  pnpm deploy:cf              Redeploy both workers"
echo "  cd apps/api && pnpm d1:migrate   Apply database migrations"
echo "  wrangler tail ${WORKER_PREFIX}-api     Tail API logs"
echo "  wrangler tail ${WORKER_PREFIX}-web     Tail Web logs"
echo ""

if [ -n "$RESEND_API_KEY" ]; then
  echo "Magic link email enabled. Sign in at ${WEB_URL}/sign-in"
elif [ -n "$GITHUB_CLIENT_ID" ] || [ -n "$GOOGLE_CLIENT_ID" ]; then
  echo "OAuth enabled. Sign in at ${WEB_URL}/sign-in"
  echo "Note: Update your OAuth app redirect URLs to point to ${WEB_URL}"
else
  echo "Warning: No sign-in method configured. Set at least one:"
  echo "  wrangler secret put RESEND_API_KEY --config apps/api/wrangler.jsonc"
fi
