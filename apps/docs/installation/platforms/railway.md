---
title: Railway
---

# Railway

[Railway](https://railway.app) can deploy Docker images directly from a registry.

## Steps

### 1. Create a new project

In Railway, click **New Project → Deploy from Docker image**.

Enter the image:

```
ghcr.io/awaitstep/awaitstep:latest
```

### 2. Set environment variables

First, generate two secret keys:

```bash
openssl rand -hex 32   # use as TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # use as BETTER_AUTH_SECRET
```

Then go to **Variables** and add:

```bash
TOKEN_ENCRYPTION_KEY=your-first-generated-key
BETTER_AUTH_SECRET=your-second-generated-key
BETTER_AUTH_URL=https://your-app.up.railway.app
PORT=8080

# Auth — configure at least one
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
```

Set `BETTER_AUTH_URL` to your Railway-generated domain (available under **Settings → Domains**).

### 3. Configure storage

Under **Volumes**, add a persistent volume and mount it at `/app/data`.

### 4. Set the port

Set the **Port** to `8080` under **Settings → Networking**.

### 5. Deploy

Click **Deploy**.

## Notes

- Railway provides a PostgreSQL plugin. If you use it, set `DATABASE_URL` to the `DATABASE_URL` variable Railway injects from the plugin.
- Railway's free tier has compute hour limits. For persistent production use, upgrade to a paid plan.
- Set the health check path to `/health` under **Settings → Health Checks** for zero-downtime deploys.
