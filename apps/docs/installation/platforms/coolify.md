---
title: Coolify
---

# Coolify

[Coolify](https://coolify.io) is a self-hosted Heroku/Netlify alternative that can deploy Docker Compose applications.

## Steps

### 1. Create a Docker Compose resource

In Coolify, click **New Resource → Docker Compose**.

Paste the following `docker-compose.yml`:

```yaml
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:latest
    restart: unless-stopped
    ports:
      - '8080:8080'
    env_file:
      - .env
    volumes:
      - awaitstep_data:/app/data

volumes:
  awaitstep_data:
```

### 2. Set environment variables

First, generate two secret keys on your local machine:

```bash
openssl rand -hex 32   # use as TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # use as BETTER_AUTH_SECRET
```

Then go to **Environment Variables** and add:

```bash
TOKEN_ENCRYPTION_KEY=your-first-generated-key
BETTER_AUTH_SECRET=your-second-generated-key
BETTER_AUTH_URL=https://workflows.example.com

# Auth — configure at least one
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
```

Set `BETTER_AUTH_URL` to the public domain Coolify assigns to the service.

### 3. Configure storage

Under **Storage**, add a persistent volume mapped to `/app/data`.

### 4. Deploy

Click **Deploy**.

## Notes

- Coolify handles TLS automatically if you configure a domain — no separate reverse proxy is needed.
- The health check endpoint is `GET /health`. Configure this in Coolify's **Health Check** settings.
- If you use Coolify's built-in PostgreSQL service, set `DATABASE_URL` to the internal connection string Coolify provides.
