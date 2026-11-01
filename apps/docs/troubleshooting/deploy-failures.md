---
title: Deploy Failures
---

# Deploy Failures

## `Missing required environment variables: VAR_NAME`

**Cause:** The workflow references an env var that is not set in either the workflow's variables or the project's global variables.

**Fix:**

1. Set the variable where the workflow can reach it — **Workspace settings → Variables**, **Project → Variables** or **Resources → Variables** for the organization (the closest level wins) — or in the workflow's own **Settings → Environment Variables** on the canvas.
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

- Fix broken expression references (<code v-pre>{{unknownNode.field}}</code> pointing to a removed node).
- Connect all nodes — every node must be reachable from the entry node.
- Check that `select` fields have a valid option selected.

---

## `Import "…" in … reaches outside the project` / `The bundle reaches outside the project`

**Cause:** A step body, project file or dependency imports a path above the
project root (`'../../config.json'` from a top-level file), an absolute path,
or a bare package that only exists outside the project. The bundler would
pick that file up from the machine doing the build, so the deploy, test
session or local run is refused. The first message comes from the check on
your source and names the file and specifier; the second comes from the
bundler-level check self-hosted runs make on the real build directory, which
also catches symlinks and packages found in a parent `node_modules`.

**Fix:** Move the file into the project and import it with `#app/` (or a
relative path that stays inside), or add the package as a dependency. The
source check reads raw text, so an escaping specifier in a comment or string
is reported too — remove it. A path built in pieces inside `import()` or
`require()` (`'../' + name`) is refused if any piece climbs with `..`, even
when the result would land inside the project: write the path whole, or
start it with `./`.

## `Could not check that the bundle stays inside the project: …`

**Cause:** The build itself failed before it could be checked — most often an
import of a file that does not exist. The text after the colon is the
bundler's own error.

**Fix:** Correct the import it names. A build that cannot be checked is never
deployed.

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
3. If the Worker exists but returns errors, a handler may have a syntax error. Open **Code** from the canvas toolbar, fix the module under `handlers/` (the Problems panel lists syntax errors), and redeploy.

---

## `Deploy stream disconnected before COMPLETED`

**Cause:** The Server-Sent Events stream from `deploy-stream` was interrupted (network issue or proxy timeout).

**Fix:** The deploy may have succeeded or still be in progress. Check the workflow's deployment status via:

```bash
curl https://app.awaitstep.dev/api/workflows/<id>/deployments \
  -H "Authorization: Bearer ask_yourkey"
```

If no deployment record exists, retry the deploy.
