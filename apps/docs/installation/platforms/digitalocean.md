---
title: DigitalOcean
---

# DigitalOcean

The recommended way to run AwaitStep on DigitalOcean is a **Droplet** with Docker installed.

## Steps

### 1. Create a Droplet

Create a Droplet running **Docker** from the Marketplace (1-Click Apps → Docker). A 1 GB / 1 vCPU Basic Droplet is sufficient for small teams.

### 2. SSH in and run the install script

```bash
ssh root@your-droplet-ip
curl -fsSL https://raw.githubusercontent.com/awaitstep/awaitstep/main/scripts/install.sh -o install.sh && bash install.sh
```

The script will prompt you for configuration and generate `docker-compose.yml`, `.env`, and optionally a `Caddyfile`.

### 3. Or set up manually

If you prefer manual setup, create the files yourself:

**docker-compose.yml:**

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
      - '80:80'
      - '443:443'
    configs:
      - source: caddyfile
        target: /etc/caddy/Caddyfile
    volumes:
      - caddy-data:/data
      - caddy-config:/config

configs:
  caddyfile:
    content: |
      your-droplet-domain.com {
        handle /api/* {
          reverse_proxy awaitstep:8080
        }
        handle {
          reverse_proxy awaitstep:3000
        }
      }

volumes:
  awaitstep-data:
  caddy-data:
  caddy-config:
```

**.env:**

```bash
TOKEN_ENCRYPTION_KEY=your-first-generated-key
BETTER_AUTH_SECRET=your-second-generated-key
BETTER_AUTH_URL=https://your-droplet-domain.com

# Auth — configure at least one
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
```

Then start:

```bash
docker compose up -d
```

### 4. Set up a domain

Point your domain to the Droplet IP. Replace `your-droplet-domain.com` in the Caddyfile with your actual domain. Caddy will automatically provision a Let's Encrypt TLS certificate.

## Notes

- Enable the DigitalOcean **Firewall** and allow only ports 22, 80, and 443 inbound.
- Use a **Volume** (Block Storage) attached to the Droplet and mount it as the Docker volume for `/app/data` for easy resizing and backups.
- DigitalOcean Managed Databases (PostgreSQL) work with AwaitStep. Set `DATABASE_URL` to the connection string from the database cluster dashboard, using the private network host for lower latency.

## App Platform (alternative)

DigitalOcean App Platform can deploy Docker images, but persistent disk support is limited. Use a Droplet if you need SQLite; use App Platform with a Managed PostgreSQL database if you prefer a fully managed setup.
