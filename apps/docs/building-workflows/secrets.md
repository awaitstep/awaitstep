---
title: Secrets & Environment Variables
---

# Secrets & Environment Variables

AwaitStep has two tiers of environment variables: **global** (project-level) and **workflow** (per-workflow). Both are injected into the deployed Cloudflare Worker as bindings.

## Global environment variables

Global env vars are defined at the project level and are available to every workflow deployed within that project.

### Creating a global env var

1. Go to **Settings → Environment Variables**.
2. Click **Add Variable**.
3. Enter a name in `SCREAMING_SNAKE_CASE` (e.g. `STRIPE_SECRET_KEY`).
4. Enter the value.
5. Toggle **Secret** on if the value should be masked in the UI and never returned by the API.

Global env var names must match `^[A-Z][A-Z0-9_]*$`.

### Secrets vs plain variables

|                   | Plain variable                           | Secret                      |
| ----------------- | ---------------------------------------- | --------------------------- |
| Visible in UI     | Yes                                      | Masked as `••••••••`        |
| Returned by API   | Yes                                      | Never                       |
| Encrypted at rest | No                                       | Yes                         |
| Use case          | Non-sensitive config (region, base URLs) | API keys, tokens, passwords |

:::warning
Once a value is saved as a secret, it cannot be read back — only overwritten or deleted. Store it somewhere safe before saving.
:::

## Workflow environment variables

Workflow-level env vars are scoped to a single workflow. They override global vars with the same name for that workflow only.

### Adding a workflow env var

1. Open a workflow and click **Settings** (the gear icon in the toolbar).
2. Under **Environment Variables**, click **Add Variable**.
3. Enter the name and value.

## Using secrets in nodes

Nodes that require API keys use `secret` fields in their config schema. When you configure such a node, you select which env var to bind to that field.

At runtime, the value is available inside the node's template as `ctx.env.VAR_NAME`. In generated workflow code, it is accessed directly from the Worker's `env` binding:

```typescript
const charge = await step.do('Charge Card', async () => {
  const res = await fetch('https://api.stripe.com/v1/charges', {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
    // ...
  })
})
```

## Encryption

Secret values are encrypted before being stored in AwaitStep's database using AES-256-GCM. The encryption key is derived from `TOKEN_ENCRYPTION_KEY` in your instance configuration. When a workflow is deployed, the decrypted value is injected into the Cloudflare Worker as a secret binding — it never appears in the generated source code.

:::danger
Never hard-code secret values in Step node code. Use the secret field mechanism instead. Hard-coded secrets will appear in generated source code and in version history.
:::

## Moving workflows between projects

When you move a workflow to another project via the API or UI, AwaitStep checks whether all workflow env vars exist in the target project. If any are missing, you receive a warning and can add them before the move completes.

## Referencing env vars in custom Step code

Inside a **Step** node's code editor, the Worker's `env` object is in scope:

```typescript
// Inside a Step node:
const apiKey = env.MY_API_KEY
const res = await fetch('https://api.example.com', {
  headers: { Authorization: `Bearer ${apiKey}` },
})
return await res.json()
```
