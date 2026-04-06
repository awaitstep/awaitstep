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

# Public URL — what users type in their browser
read -rp "Public URL (include https:// if using SSL) [http://${DEFAULT_IP}:8080]: " APP_URL
APP_URL="${APP_URL:-http://${DEFAULT_IP}:8080}"
APP_URL="${APP_URL%/}"

# Detect if domain is used
IS_DOMAIN=false
DOMAIN=""
if echo "${APP_URL}" | grep -qP 'https?://[a-zA-Z]'; then
  IS_DOMAIN=true
  DOMAIN=$(echo "${APP_URL}" | sed -E 's|https?://||' | sed 's|:.*||')
fi

# SSL — only ask for domains
MANAGE_SSL=false
if [ "${IS_DOMAIN}" = "true" ]; then
  echo ""
  read -rp "Manage SSL certificate with Caddy (Let's Encrypt)? [y/N]: " SSL_INPUT
  if [ "${SSL_INPUT}" = "y" ] || [ "${SSL_INPUT}" = "Y" ]; then
    MANAGE_SSL=true
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
WEB_PORT=3000
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

# ── Caddyfile + docker-compose.yml ──

if [ "${MANAGE_SSL}" = "true" ]; then
  # Caddy manages SSL with Let's Encrypt
  cat > Caddyfile <<CADDYFILE
${DOMAIN} {
  handle /api/* {
    reverse_proxy awaitstep:8080
  }
  handle {
    reverse_proxy awaitstep:3000
  }
}
CADDYFILE

  LOCAL_DEV_BLOCK=""
  if [ "${ENABLE_LOCAL_DEV}" = "true" ]; then
    LOCAL_DEV_BLOCK=$'    ports:\n      - "8787:8787"\n'
  fi

  cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    expose:
      - "8080"
      - "3000"
${LOCAL_DEV_BLOCK}    volumes:
      - awaitstep-data:/app/data
    env_file: .env

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

  echo "Generated docker-compose.yml with Caddy (SSL)"

elif [ "${IS_DOMAIN}" = "true" ]; then
  # Domain but no SSL (e.g. behind Cloudflare)
  cat > Caddyfile <<CADDYFILE
:80 {
  handle /api/* {
    reverse_proxy awaitstep:8080
  }
  handle {
    reverse_proxy awaitstep:3000
  }
}
CADDYFILE

  LOCAL_DEV_BLOCK=""
  if [ "${ENABLE_LOCAL_DEV}" = "true" ]; then
    LOCAL_DEV_BLOCK=$'    ports:\n      - "8787:8787"\n'
  fi

  cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    expose:
      - "8080"
      - "3000"
${LOCAL_DEV_BLOCK}    volumes:
      - awaitstep-data:/app/data
    env_file: .env

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

  echo "Generated docker-compose.yml with Caddy"

else
  # IP mode
  cat > Caddyfile <<CADDYFILE
:${PORT} {
  handle /api/* {
    reverse_proxy awaitstep:8080
  }
  handle {
    reverse_proxy awaitstep:3000
  }
}
CADDYFILE

  LOCAL_DEV_BLOCK=""
  if [ "${ENABLE_LOCAL_DEV}" = "true" ]; then
    LOCAL_DEV_BLOCK=$'    ports:\n      - "8787:8787"\n'
  fi

  cat > docker-compose.yml <<COMPOSE
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    container_name: awaitstep
    restart: unless-stopped
    expose:
      - "8080"
      - "3000"
${LOCAL_DEV_BLOCK}    volumes:
      - awaitstep-data:/app/data
    env_file: .env

  caddy:
    image: caddy:2-alpine
    container_name: awaitstep-caddy
    restart: unless-stopped
    ports:
      - "${PORT}:${PORT}"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro

volumes:
  awaitstep-data:
    driver: local
COMPOSE

  echo "Generated docker-compose.yml with Caddy"
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
if [ "${MANAGE_SSL}" = "true" ]; then
  echo ""
  echo "Caddy will automatically provision an SSL certificate for ${DOMAIN}."
  echo "Make sure ports 80 and 443 are open and DNS points to this server."
fi
