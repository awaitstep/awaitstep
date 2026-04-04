---
title: Render
---

# Render

[Render](https://render.com) supports deploying Docker images as Web Services.

## Steps

### 1. Create a Web Service

In the Render dashboard, click **New → Web Service → Deploy an existing image from a registry**.

Enter the image URL:

```
ghcr.io/awaitstep/awaitstep:latest
```

Set the **Instance Type** to at least **Starter** (free tier does not support persistent disks).

### 2. Set environment variables

First, generate two secret keys:

```bash
openssl rand -hex 32   # use as TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # use as BETTER_AUTH_SECRET
```

Then under **Environment Variables**, add:

```bash
TOKEN_ENCRYPTION_KEY=your-first-generated-key
BETTER_AUTH_SECRET=your-second-generated-key
BETTER_AUTH_URL=https://awaitstep.onrender.com
PORT=8080

# Auth — configure at least one
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
```

Set `BETTER_AUTH_URL` to your Render service URL or a custom domain.

### 3. Configure storage

Under **Disks**, add a persistent disk and mount it at `/app/data`.

### 4. Set the port

Set the **Port** to `8080`.

### 5. Create the service

Click **Create Web Service**.

## Notes

- Render's free tier spins down after inactivity. Use a paid plan for always-on availability.
- Render provides a managed PostgreSQL service. Set `DATABASE_URL` to the internal connection string from the database dashboard.
- Set the **Health Check Path** to `/api/health` in the service settings.
