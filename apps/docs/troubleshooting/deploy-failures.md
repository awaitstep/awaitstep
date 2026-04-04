---
title: Deploy Failures
---

# Deploy Failures

## `Missing required environment variables: VAR_NAME`

**Cause:** The workflow references an env var that is not set in either the workflow's variables or the project's global variables.

**Fix:**

1. Go to **Settings → Environment Variables** (global) or the workflow's **Settings → Environment Variables** (workflow-level).
2. Add the missing variable with the correct name and value.
3. Retry the deploy.

---

## `Credential verification failed`

**Cause:** The Cloudflare API token stored in the connection is invalid, expired, or missing required permissions.

**Fix:**

1. Go to **Settings → Connections**.
2. Click **Edit** on the failing connection.
3. Paste a new API token.
4. Click **Verify** to confirm the token is valid before saving.

See [Token Errors](./token-errors.md) for the full list of required Cloudflare permissions.

---

## `Worker name already exists with a different script`

**Cause:** A Worker with the same name already exists in your Cloudflare account but was not created by AwaitStep (e.g. a manually created Worker).

**Fix:** Either delete the conflicting Worker in the Cloudflare dashboard, or rename your workflow in AwaitStep to generate a different Worker name.

---

## `wrangler: command not found`

**Cause:** The AwaitStep container cannot find `wrangler`. This usually means the container image is outdated.

**Fix:**

```bash
docker compose pull
docker compose up -d
```

See [Wrangler Errors](./wrangler-errors.md) for more wrangler-specific issues.

---

## `IR validation failed`

**Cause:** The workflow IR has validation errors — for example, a broken expression reference or a disconnected node.

**Fix:** The deploy response includes a list of validation errors with node IDs and paths. Open the canvas and address each error:

- Fix broken expression references (`<span v-pre>&#123;&#123;unknownNode.field&#125;&#125;</span>` pointing to a removed node).
- Connect all nodes — every node must be reachable from the entry node.
- Check that `select` fields have a valid option selected.

---

## `Binding resolution failed: WORKFLOW_NAME not found`

**Cause:** A Sub-Workflow node references a workflow by name, but no deployed Cloudflare Worker with that binding name was found in the account.

**Fix:**

1. Deploy the referenced workflow first.
2. Ensure the workflow name exactly matches the name used in the Sub-Workflow node.
3. Retry the parent workflow deploy.

---

## Deploy completes but workflow is not reachable

**Cause:** The deploy status shows `COMPLETED` but the Worker URL returns a 404 or 500.

**Fix:**

1. Check the Cloudflare dashboard → Workers & Pages to confirm the Worker was created.
2. Check Worker logs in the Cloudflare dashboard for runtime errors.
3. If the Worker exists but returns errors, the trigger code may have a syntax error. Edit the trigger code in **Settings → Trigger Code** and redeploy.

---

## `Deploy stream disconnected before COMPLETED`

**Cause:** The Server-Sent Events stream from `deploy-stream` was interrupted (network issue or proxy timeout).

**Fix:** The deploy may have succeeded or still be in progress. Check the workflow's deployment status via:

```bash
curl https://app.awaitstep.dev/api/workflows/<id>/deployments \
  -H "Authorization: Bearer ask_yourkey"
```

If no deployment record exists, retry the deploy.
