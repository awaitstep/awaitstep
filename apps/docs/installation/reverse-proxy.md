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
