---
title: Health Checks
---

# Health Checks

## Health endpoint

AwaitStep exposes a health check endpoint:

```
GET /api/health
```

Returns `200 OK` with a JSON body when the application is running and the database is reachable:

```json
{ "status": "ok" }
```

Returns a non-2xx status if the application is starting up or unhealthy.

## Docker healthcheck

Add a healthcheck to your `docker-compose.yml` so Docker knows when the container is ready and can automatically restart it if it becomes unhealthy:

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
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:8080/api/health']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  awaitstep_data:
```

`start_period` gives the container 10 seconds to initialize before failed health checks count toward `retries`.

## Monitoring integrations

The `/api/health` endpoint is compatible with any uptime monitoring service that supports HTTP checks (UptimeRobot, Betterstack, Checkly, etc.). Point the monitor at `https://workflows.example.com/api/health` and alert on any non-2xx response.
