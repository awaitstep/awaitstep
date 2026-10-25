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
    reverse_proxy localhost:8080 {
        header_up X-AwaitStep-Proxy {$TRUSTED_PROXY_SECRET}
        header_up X-AwaitStep-Client {client_ip}
    }
}
```

Start Caddy with the same `TRUSTED_PROXY_SECRET` AwaitStep has in its `.env`
(see [Client addresses](#client-addresses-and-rate-limits)):

```bash
TRUSTED_PROXY_SECRET=<the value from .env> caddy run --config Caddyfile
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
        # Proves this proxy may name the client — the value of
        # TRUSTED_PROXY_SECRET from AwaitStep's .env.
        proxy_set_header X-AwaitStep-Proxy  "<TRUSTED_PROXY_SECRET>";
        proxy_set_header X-AwaitStep-Client $remote_addr;
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

AwaitStep rate-limits by client address and records it on sessions. A proxy
in front of it has to tell AwaitStep who the client is — and has to **prove**
it is the proxy, because an address cannot: workflow code AwaitStep runs for
test sessions and local dev reaches the API from the same host, and from the
same Docker network, as any proxy would.

- Generate a secret, put it in AwaitStep's `.env` as `TRUSTED_PROXY_SECRET`
  (`openssl rand -hex 32`), and give the same value to the proxy. The
  configurations above send it as `X-AwaitStep-Proxy` and name the client in
  `X-AwaitStep-Client`. The [install script](../getting-started/quickstart)
  does all of this for you.
- A request without the secret — a client reaching port `8080` directly,
  workflow code on the host — is keyed on its own connection, whatever
  headers it sends.
- Without `TRUSTED_PROXY_SECRET`, AwaitStep cannot tell who is behind the
  proxy, and every user shares the proxy's address and its rate limits. The
  startup log warns about it, and so does the first request that arrives
  with an `X-Forwarded-For` it had to ignore.

::: warning Upgrading from an earlier release
Earlier releases believed `X-Forwarded-For` from anyone. They no longer do:
after upgrading, a deployment behind a proxy keeps working, but every user
shares one set of rate limits until the proxy sends the secret. Add
`TRUSTED_PROXY_SECRET` to `.env`, add the `X-AwaitStep-Proxy` /
`X-AwaitStep-Client` lines above to your proxy configuration, and restart
both. Do not re-run the install script on an existing installation: it
writes a fresh `.env`, including a new `TOKEN_ENCRYPTION_KEY`, and stored
credentials would no longer decrypt.
:::

**Managed platforms** whose load balancers cannot add a header (Railway,
Render, App Platform) can instead name the balancer's address range in
`TRUSTED_PROXIES`; AwaitStep then reads `X-Forwarded-For` from connections in
that range. Never include loopback or the network AwaitStep itself runs on —
workflow code could then name any client it likes. A malformed entry stops
AwaitStep at startup rather than being ignored.

The limits are counted in memory, per process. They reset when the container
restarts and are not shared between instances — fine for the single-instance
deployment this guide sets up; a horizontally scaled deployment would need a
shared store.
