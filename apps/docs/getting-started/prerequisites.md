---
title: Prerequisites
---

# Prerequisites

## To run AwaitStep

| Requirement          | Minimum version       | Notes                                                              |
| -------------------- | --------------------- | ------------------------------------------------------------------ |
| Docker               | 20.10                 | Docker Desktop on macOS/Windows is fine                            |
| Docker Compose       | V2 (plugin)           | Shipped with Docker Desktop; `docker compose` not `docker-compose` |
| Cloudflare account   | Any (free tier works) | Workflows are available on all plans                               |
| Cloudflare API token | —                     | See below                                                          |

## Cloudflare API token permissions

Create a **Custom token** in the [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens) with the following permissions:

| Scope   | Resource                     | Permission |
| ------- | ---------------------------- | ---------- |
| Account | Workers Scripts              | Edit       |
| Zone    | Workers Routes               | Edit       |
| Account | Workers Tail                 | Read       |
| Account | Workers Builds Configuration | Edit       |
| Account | Workers Observability        | Edit       |

:::tip
If your workflows use KV, D1, R2, AI, Agents, or Queues bindings, also add **Edit** permission for those resources under the Account scope.
:::

:::warning
Do not use your Global API Key. Always create a scoped Custom token.
:::

## For local development only

If you plan to contribute to AwaitStep or run it from source, you also need:

| Requirement | Minimum version |
| ----------- | --------------- |
| Node.js     | 20              |
| pnpm        | 9               |

These are **not** required to run AwaitStep from the Docker image.
