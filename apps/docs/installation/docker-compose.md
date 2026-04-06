---
title: Docker Compose
---

# Docker Compose

## Install script (recommended)

The fastest way to get started is the install script. It creates the required files, generates secrets, and starts the container:

```bash
curl -fsSL https://raw.githubusercontent.com/awaitstep/awaitstep/main/scripts/install.sh -o install.sh && bash install.sh
```

After it finishes, open `http://localhost:8080`.

## Manual setup

If you prefer to set things up yourself, follow the steps below.

### 1. Create a directory

```bash
mkdir awaitstep && cd awaitstep
```

### 2. Write docker-compose.yml

```yaml
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    restart: unless-stopped
    expose:
      - '8080'
      - '3000'
    env_file:
      - .env
    volumes:
      - awaitstep-data:/app/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - '8080:8080'
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile

configs:
  caddyfile:
    content: |
      :8080 {
        handle /api/* {
          reverse_proxy awaitstep:8080
        }
        handle {
          reverse_proxy awaitstep:3000
        }
      }

volumes:
  awaitstep-data:
```

Caddy routes `/api/*` to the API server and everything else to the web UI.

:::tip
If you need the **Local Test** feature, add a `/local-dev/*` route to the Caddyfile that proxies to port `8787`. See [Reverse Proxy](./reverse-proxy) for details.
:::

### 3. Write .env

```bash
# Security
TOKEN_ENCRYPTION_KEY=your-first-generated-key
BETTER_AUTH_SECRET=your-second-generated-key
BETTER_AUTH_URL=http://localhost:8080

# Database (SQLite default)
# PostgreSQL (uncomment and fill in to use)
# DATABASE_URL=postgresql://user:password@host:5432/awaitstep

# Auth — configure at least one
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
```

### 4. Generate secrets

```bash
openssl rand -hex 32   # use output for TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # use output for BETTER_AUTH_SECRET
```

Paste each value into `.env`.

### 5. Start

```bash
docker compose up -d
```

Check logs:

```bash
docker compose logs -f awaitstep
```

Open `http://localhost` once the container is healthy.

## Data persistence

All application data — the SQLite database and any local files — is stored in the `awaitstep_data` Docker volume mounted at `/app/data`. As long as this volume exists, your data survives container restarts and image upgrades.

:::warning
Never mount a host directory that the Docker user cannot write to. If AwaitStep cannot write to `/app/data`, it will fail to start.
:::
