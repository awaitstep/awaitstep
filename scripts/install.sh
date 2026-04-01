#!/usr/bin/env bash
set -euo pipefail

echo "AwaitStep — Docker Install"
echo "=========================="
echo ""

# Check prerequisites
if ! command -v docker &>/dev/null; then
  echo "Error: Docker is not installed. Install it from https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "Error: Docker Compose is not available. Install it from https://docs.docker.com/compose/install/"
  exit 1
fi

# Detect public IP for default URL
DEFAULT_IP=$(curl -s -4 --max-time 3 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "Configure your AwaitStep instance:"
echo ""

# Public URL
read -rp "Public URL [http://${DEFAULT_IP}:8080]: " APP_URL
APP_URL="${APP_URL:-http://${DEFAULT_IP}:8080}"
APP_URL="${APP_URL%/}"

# Determine mode: IP (direct) or domain (caddy)
IS_DOMAIN=false
DOMAIN=""
USE_SSL=false

if echo "${APP_URL}" | grep -qP 'https?://[a-zA-Z]'; then
  IS_DOMAIN=true
  DOMAIN=$(echo "${APP_URL}" | sed -E 's|https?://||' | sed 's|:.*||')
  if echo "${APP_URL}" | grep -q '^https://'; then
    USE_SSL=true
  fi
fi

# Port — only ask for IP mode
PORT="8080"
if [ "${IS_DOMAIN}" = "false" ]; then
  read -rp "Port [8080]: " PORT
  PORT="${PORT:-8080}"
fi

# Database
echo ""
echo "Database: SQLite (default, stored in Docker volume) or Postgres"
read -rp "Postgres URL (leave empty for SQLite): " DATABASE_URL

# Local dev
echo ""
read -rp "Enable local dev testing? [Y/n]: " ENABLE_LOCAL_DEV_INPUT
ENABLE_LOCAL_DEV=$([ "${ENABLE_LOCAL_DEV_INPUT:-Y}" = "n" ] || [ "${ENABLE_LOCAL_DEV_INPUT}" = "N" ] && echo "false" || echo "true")

# Email (Resend)
echo ""
read -rp "Resend API key (for magic link emails, optional): " RESEND_API_KEY

# OAuth providers
echo ""
echo "OAuth providers (optional, press Enter to skip):"
read -rp "  GitHub Client ID: " GITHUB_CLIENT_ID
read -rp "  GitHub Client Secret: " GITHUB_CLIENT_SECRET
read -rp "  Google Client ID: " GOOGLE_CLIENT_ID
read -rp "  Google Client Secret: " GOOGLE_CLIENT_SECRET

# Generate secrets
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)

# Write .env
cat > .env <<EOF
PORT=8080
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=${APP_URL}
DATABASE_URL=${DATABASE_URL}
ENABLE_LOCAL_DEV=${ENABLE_LOCAL_DEV}
RESEND_API_KEY=${RESEND_API_KEY}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
EOF

echo ""
echo "Generated .env"

# ── IP mode: direct port binding, no caddy ──

if [ "${IS_DOMAIN}" = "false" ]; then
  cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    ports:
      - "${PORT}:8080"
    volumes:
      - awaitstep-data:/app/data
    env_file: .env
    environment:
      PORT: 8080

volumes:
  awaitstep-data:
    driver: local
COMPOSE

  echo "Generated docker-compose.yml"

# ── Domain mode: caddy reverse proxy ──

else
  if [ "${USE_SSL}" = "true" ]; then
    # https:// → caddy manages SSL on 80+443
    cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - awaitstep-data:/app/data
    env_file: .env
    environment:
      PORT: 8080

  caddy:
    image: caddy:2-alpine
    container_name: awaitstep-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  awaitstep-data:
    driver: local
  caddy-data:
    driver: local
  caddy-config:
    driver: local
COMPOSE

    cat > Caddyfile <<CADDYFILE
${DOMAIN} {
  reverse_proxy awaitstep:8080
}
CADDYFILE

    echo "Generated docker-compose.yml with Caddy (SSL)"
    echo "Generated Caddyfile for ${DOMAIN}"

  else
    # http:// → caddy reverse proxy on port 80, no SSL
    cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - awaitstep-data:/app/data
    env_file: .env
    environment:
      PORT: 8080

  caddy:
    image: caddy:2-alpine
    container_name: awaitstep-caddy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro

volumes:
  awaitstep-data:
    driver: local
COMPOSE

    cat > Caddyfile <<CADDYFILE
:80 {
  reverse_proxy awaitstep:8080
}
CADDYFILE

    echo "Generated docker-compose.yml with Caddy (no SSL)"
    echo "Generated Caddyfile"
  fi
fi

echo ""

# Pull and start
echo "Pulling image and starting AwaitStep..."
docker compose pull
docker compose up -d

echo ""
echo "AwaitStep is running at ${APP_URL}"
echo ""
echo "Commands:"
echo "  docker compose logs -f    View logs"
echo "  docker compose down       Stop"
echo "  docker compose up -d      Start"
echo "  Edit .env and restart to change configuration"
if [ "${USE_SSL}" = "true" ]; then
  echo ""
  echo "Caddy will automatically provision an SSL certificate for ${DOMAIN}."
  echo "Make sure ports 80 and 443 are open and DNS points to this server."
elif [ "${IS_DOMAIN}" = "true" ]; then
  echo ""
  echo "Caddy is reverse proxying on port 80 (no SSL)."
  echo "If using Cloudflare proxy, set SSL mode to Flexible."
fi
