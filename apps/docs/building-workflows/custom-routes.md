---
title: Custom Routes
---

# Custom Routes

By default, deployed workflows are accessible at an auto-assigned `*.workers.dev` URL. Custom routes let you serve a workflow from your own domain, such as `api.example.com/process-order/*`.

## Prerequisites

- A domain (zone) added to the same Cloudflare account used by your AwaitStep connection.
- A DNS record for the hostname used in the route pattern (see [DNS setup](#dns-setup) below).

## Configuring a route

1. Open a workflow and click **Settings** (the gear icon in the toolbar).
2. Under **Custom Route**, enter:
   - **Route pattern** — the URL pattern to match, e.g. `api.example.com/process-order/*`
   - **Zone name** — the root domain registered in Cloudflare, e.g. `example.com`
3. Save the workflow and deploy.

AwaitStep adds the route to the generated `wrangler.json` using the [zone name route](https://developers.cloudflare.com/workers/configuration/routing/routes/) format:

```json
{
  "routes": [
    {
      "pattern": "api.example.com/process-order/*",
      "zone_name": "example.com"
    }
  ]
}
```

After deploy, traffic matching the pattern is routed to your workflow's Worker instead of the default `*.workers.dev` URL.

## DNS setup

Cloudflare routes require a DNS record for the hostname in your pattern. If the hostname doesn't have a record, browsers will get a `DNS_PROBE_FINISHED_NXDOMAIN` error even though the Worker is deployed.

For hostnames that don't point to an origin server (the Worker _is_ the origin), create a proxied AAAA record with the placeholder address `100::`:

| Type | Name              | Content | Proxy status |
| ---- | ----------------- | ------- | ------------ |
| AAAA | `api.example.com` | `100::` | Proxied      |

To create this via the Cloudflare dashboard:

1. Go to your domain in the Cloudflare dashboard.
2. Navigate to **DNS > Records**.
3. Click **Add Record**.
4. Set type to **AAAA**, name to the hostname (e.g. `api`), content to `100::`, and ensure **Proxy status** is enabled (orange cloud).

:::tip
`100::` is the IPv6 discard prefix ([RFC 6666](https://datatracker.ietf.org/doc/html/rfc6666)). Cloudflare never sends traffic to this address when the record is proxied — all requests are intercepted and routed to your Worker.
:::

:::warning
The DNS record must be **proxied** (orange cloud). An unproxied (grey cloud / DNS-only) AAAA record pointing to `100::` will not work and will cause connection failures.
:::

## Route patterns

Cloudflare route patterns support a trailing wildcard `*`:

| Pattern                    | Matches                                     |
| -------------------------- | ------------------------------------------- |
| `api.example.com/*`        | All paths on `api.example.com`              |
| `example.com/workflows/*`  | Paths under `/workflows/` on `example.com`  |
| `api.example.com/orders/*` | Paths under `/orders/` on `api.example.com` |

The wildcard only matches path segments — it does not match subdomains. More specific patterns take priority over broader ones.

## Using the API

You can also configure routes via the REST API:

```bash
curl -X PATCH https://app.awaitstep.dev/api/workflows/wf_abc123 \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "deployConfig": {
      "route": {
        "pattern": "api.example.com/process-order/*",
        "zoneName": "example.com"
      }
    }
  }'
```

The route takes effect on the next deploy.

## Removing a route

To remove a custom route, clear both fields in the Settings panel and redeploy. The workflow will revert to its `*.workers.dev` URL.

## Troubleshooting

| Problem                            | Cause                                                             | Fix                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DNS_PROBE_FINISHED_NXDOMAIN`      | No DNS record for the hostname                                    | Add a proxied AAAA record pointing to `100::`                                        |
| Deploy fails with "zone not found" | The zone name doesn't match a domain on your Cloudflare account   | Check that the zone name matches exactly (e.g. `example.com`, not `api.example.com`) |
| Route not working after deploy     | DNS record exists but is not proxied                              | Enable the proxy (orange cloud) on the DNS record                                    |
| 522 error                          | DNS record is proxied but points to a real IP that is unreachable | Change the record to AAAA `100::`                                                    |
