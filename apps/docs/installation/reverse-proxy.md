---
title: Reverse Proxy
---

# Reverse Proxy

AwaitStep listens on port `8080`. In production you should put a reverse proxy in front of it to handle TLS termination and domain routing.

## Caddy (recommended)

[Caddy](https://caddyserver.com) automatically provisions and renews TLS certificates via Let's Encrypt. It is the simplest option for most self-hosted deployments.

```
# Caddyfile
workflows.example.com {
    handle /local-dev/* {
        uri strip_prefix /local-dev
        reverse_proxy localhost:8787
    }
    reverse_proxy localhost:8080
}
```

Start Caddy:

```bash
caddy run --config Caddyfile
```

That is all that is required. Caddy handles HTTPS, HTTP→HTTPS redirects, and certificate renewal automatically.

The `/local-dev/*` route proxies the **Local Test** wrangler dev server. If you don't use local testing, you can omit it.

## nginx

```nginx
server {
    listen 80;
    server_name workflows.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name workflows.example.com;

    ssl_certificate     /etc/letsencrypt/live/workflows.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/workflows.example.com/privkey.pem;

    # Local Test dev server (optional)
    location /local-dev/ {
        rewrite ^/local-dev/(.*) /$1 break;
        proxy_pass http://localhost:8787;
    }

    location / {
        proxy_pass         http://localhost:8080;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for Server-Sent Events (live log streaming)
        proxy_set_header Connection        "";
        proxy_buffering                    off;
        proxy_cache                        off;
        chunked_transfer_encoding          on;
    }
}
```

:::warning
The SSE headers (`proxy_buffering off`, `proxy_cache off`, `Connection ""`) are required. Without them, the live deploy log stream in the UI will not work.
:::

Use [Certbot](https://certbot.eff.org) to obtain and auto-renew the Let's Encrypt certificate:

```bash
certbot --nginx -d workflows.example.com
```

## Update BETTER_AUTH_URL

After setting up the reverse proxy, update `BETTER_AUTH_URL` in your `.env` to match the public URL:

```bash
BETTER_AUTH_URL=https://workflows.example.com
```

Restart the container after changing this value.

## Client addresses and rate limits

AwaitStep rate-limits by client address and records it on sessions. A
forwarding header is a claim, so it only counts when the connection it
arrives on comes from a **trusted proxy**:

- A connection from anywhere else is keyed on its own address, whatever
  headers it sends — reaching port `8080` directly cannot fake an address.
- A connection from a trusted proxy is read from `X-Forwarded-For`, right to
  left: each proxy appends the address it saw, so AwaitStep skips trusted
  hops and takes the first address that is not one. Whatever the client
  wrote further left is ignored. (`X-Real-IP` is used only when there is no
  `X-Forwarded-For` at all.)

Loopback is always trusted, which covers both configurations above when the
proxy runs on the same host — Caddy and nginx both set `X-Forwarded-For`.

**A proxy on another host or container must be named in `TRUSTED_PROXIES`**,
e.g. `TRUSTED_PROXIES=172.16.0.0/12` for a Caddy container on a Docker
network (the [Docker Compose](./docker-compose) setup). Without it the proxy
itself looks like the client: nothing can be spoofed, but every user shares
the proxy's limits.

The limits are counted in memory, per process. They reset when the container
restarts and are not shared between instances — fine for the single-instance
deployment this guide sets up; a horizontally scaled deployment would need a
shared store.
