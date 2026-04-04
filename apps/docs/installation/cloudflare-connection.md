---
title: Cloudflare Connection
---

# Cloudflare Connection

AwaitStep deploys workflows to your Cloudflare account using a scoped API token. You create the token once and paste it into the AwaitStep UI.

## Create a Custom API token

1. Open the [Cloudflare API Tokens page](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Click **Get started** next to **Create Custom Token** (do not use a template).
4. Give the token a descriptive name, e.g. `AwaitStep Deploy`.
5. Under **Permissions**, add the following:

| Scope   | Resource                     | Permission |
| ------- | ---------------------------- | ---------- |
| Account | Workers Scripts              | Edit       |
| Zone    | Workers Routes               | Edit       |
| Account | Workers Tail                 | Read       |
| Account | Workers Builds Configuration | Edit       |
| Account | Workers Observability        | Edit       |

6. If your workflows use bindings, add the corresponding permissions:

| Binding type | Additional permission needed        |
| ------------ | ----------------------------------- |
| KV Namespace | Account → Workers KV Storage → Edit |
| D1 Database  | Account → D1 → Edit                 |
| R2 Bucket    | Account → R2 Storage → Edit         |
| Queues       | Account → Queues → Edit             |
| AI           | Account → Workers AI → Edit         |

7. Under **Account Resources**, select the account you want AwaitStep to deploy to.
8. Click **Continue to summary**, then **Create Token**.
9. Copy the token — it is shown only once.

:::danger
Do not use your Global API Key. It grants unrestricted access to your entire Cloudflare account. Always use a scoped Custom token.
:::

## Connect in AwaitStep

1. Go to **Connections** and click **Add Connection**.
2. The dialog shows the exact permissions required. Paste your API token.
3. Click **Verify & Continue**. AwaitStep validates the token and lists accessible accounts.
4. Select the target account and confirm.

![Add Connection dialog with required permissions](/images/add-connection.png)

## Token rotation

When you need to rotate the token (e.g. for security hygiene or after a suspected leak):

1. Create a new token in the Cloudflare dashboard with the same permissions.
2. In AwaitStep, go to **Connections → Your Cloudflare Connection → Edit** and paste the new token.
3. Click **Verify & Save**.
4. Delete the old token from the Cloudflare dashboard.

Existing deployed workflows are not affected by token rotation — they run as Cloudflare Workers and do not depend on the AwaitStep token at runtime.
