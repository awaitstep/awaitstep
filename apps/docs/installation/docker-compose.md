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

  # Optional: keep photos and logos in a MinIO bucket instead of the
  # database. Uncomment, then in the MinIO console (port 9001) create the
  # `awaitstep` bucket and an access key limited to it; put that key (not
  # the root user) in .env as S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, with
  # IMAGE_STORE=s3. Pin the image to a RELEASE.* tag rather than latest.
  # minio:
  #   image: minio/minio:latest
  #   restart: unless-stopped
  #   command: server /data --console-address ':9001'
  #   environment:
  #     MINIO_ROOT_USER: ${MINIO_ROOT_USER}
  #     MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
  #   volumes:
  #     - minio-data:/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    # The same TRUSTED_PROXY_SECRET as AwaitStep's .env: Caddy proves with it
    # that it may name the client. Without it every user shares Caddy's limits.
    environment:
      TRUSTED_PROXY_SECRET: ${TRUSTED_PROXY_SECRET}
    ports:
      - '8080:80'
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile

configs:
  caddyfile:
    content: |
      :80 {
        handle /api/* {
          reverse_proxy awaitstep:8080 {
            header_up X-AwaitStep-Proxy {$$TRUSTED_PROXY_SECRET}
            header_up X-AwaitStep-Client {client_ip}
          }
        }
        handle {
          reverse_proxy awaitstep:3000 {
            header_up X-AwaitStep-Proxy {$$TRUSTED_PROXY_SECRET}
            header_up X-AwaitStep-Client {client_ip}
          }
        }
      }

volumes:
  awaitstep-data:
  # minio-data:
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
# Shared with Caddy: proves it may name the client (see Reverse Proxy)
TRUSTED_PROXY_SECRET=your-third-generated-key
BETTER_AUTH_URL=http://localhost:8080

# Database (SQLite default)
# PostgreSQL (uncomment and fill in to use)
# DATABASE_URL=postgresql://user:password@host:5432/awaitstep

# Photos and logos: the database keeps them (default). With the MinIO service:
# MINIO_ROOT_USER=minio-admin
# MINIO_ROOT_PASSWORD=a-long-random-password
# IMAGE_STORE=s3
# S3_ENDPOINT=http://minio:9000
# S3_BUCKET=awaitstep
# S3_ACCESS_KEY_ID=the-bucket-key-from-the-console
# S3_SECRET_ACCESS_KEY=its-secret

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
openssl rand -hex 32   # use output for TRUSTED_PROXY_SECRET
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
