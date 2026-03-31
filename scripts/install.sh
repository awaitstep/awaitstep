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

# Prompt for port
read -rp "Port [8080]: " PORT
PORT="${PORT:-8080}"

# Optional: Resend API key for magic link emails
read -rp "Resend API key (optional, for magic link emails): " RESEND_API_KEY

# Generate secrets
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)

# Write .env
cat > .env <<EOF
PORT=${PORT}
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=http://localhost:${PORT}

# To use Postgres instead of SQLite, set DATABASE_URL:
# DATABASE_URL=postgres://user:pass@host:5432/awaitstep

# Resend API key for magic link emails:
RESEND_API_KEY=${RESEND_API_KEY}

# Uncomment to enable OAuth providers:
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
EOF

echo ""
echo "Generated .env with secrets."

# Write docker-compose.yml
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
    environment:
      PORT: 8080
      TOKEN_ENCRYPTION_KEY: "\${TOKEN_ENCRYPTION_KEY}"
      BETTER_AUTH_SECRET: "\${BETTER_AUTH_SECRET}"
      BETTER_AUTH_URL: "\${BETTER_AUTH_URL:-http://localhost:8080}"
      DATABASE_URL: "\${DATABASE_URL:-}"
      GITHUB_CLIENT_ID: "\${GITHUB_CLIENT_ID:-}"
      GITHUB_CLIENT_SECRET: "\${GITHUB_CLIENT_SECRET:-}"
      GOOGLE_CLIENT_ID: "\${GOOGLE_CLIENT_ID:-}"
      GOOGLE_CLIENT_SECRET: "\${GOOGLE_CLIENT_SECRET:-}"
      RESEND_API_KEY: "\${RESEND_API_KEY:-}"

volumes:
  awaitstep-data:
    driver: local
COMPOSE

echo "Generated docker-compose.yml."
echo ""

# Pull and start
echo "Pulling image and starting AwaitStep..."
docker compose pull
docker compose up -d

echo ""
echo "AwaitStep is running at http://localhost:${PORT}"
echo ""
echo "Next steps:"
echo "  - Open http://localhost:${PORT} in your browser"
echo "  - Sign in with a magic link (email)"
echo "  - To use Postgres: set DATABASE_URL in .env and restart"
echo "  - To enable GitHub/Google OAuth: edit .env and restart"
echo "  - To stop: docker compose down"
echo "  - Data is persisted in the awaitstep-data Docker volume"
