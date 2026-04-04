---
title: Wrangler Errors
---

# Wrangler Errors

AwaitStep uses `wrangler` internally to bundle and deploy Cloudflare Workers. Wrangler errors are surfaced in the deploy log.

## `wrangler: command not found`

**Cause:** The `wrangler` CLI is not installed in the container.

**Fix:** Pull the latest container image:

```bash
docker compose pull
docker compose up -d
```

If running AwaitStep from source, install wrangler:

```bash
pnpm add -g wrangler
# or
npm install -g wrangler
```

---

## `Authentication error: You must be logged in`

**Cause:** Wrangler is trying to use its own authentication instead of the API token supplied by AwaitStep. This can happen if there is a stale `~/.wrangler/config` file inside the container.

**Fix:**

1. Stop the container.
2. Remove the wrangler config volume or exec into the container and delete `~/.wrangler/config`.
3. Restart the container.

If running from source:

```bash
rm -rf ~/.wrangler/config
```

---

## `A worker with this name already exists`

**Cause:** A Worker with the generated name already exists in your Cloudflare account, created outside of AwaitStep.

**Fix:** Either:

- Delete the conflicting Worker in the Cloudflare dashboard.
- Or rename your AwaitStep workflow to generate a different Worker name.

Worker names are derived from the workflow name and the `APP_NAME` env var.

---

## `Error: Script startup exceeded CPU time limit`

**Cause:** The generated Worker script fails to initialise within Cloudflare's startup CPU time limit. This can happen if the workflow has very complex generated code.

**Fix:** Simplify the workflow. If the issue persists, file a bug — this may indicate a code generation issue.

---

## `Error: Too many resources bound`

**Cause:** The workflow references too many KV namespaces, D1 databases, R2 buckets, or other Cloudflare bindings. Cloudflare limits the number of bindings per Worker.

**Fix:** Reduce the number of resources used by the workflow. Consider consolidating into fewer namespaces or databases.

---

## `TypeError: Cannot read properties of undefined` in deploy log

**Cause:** A node's config has a missing required field that produced invalid generated code.

**Fix:**

1. Open the workflow canvas.
2. Look for nodes with a warning indicator.
3. Open each node's config drawer and ensure all required fields are filled.
4. Re-deploy.

---

## `Build failed: Module not found`

**Cause:** The workflow or a node template imports a module that is not available. This can happen with marketplace nodes that have NPM dependencies not bundled correctly.

**Fix:**

1. Check if the node's package dependencies are listed in its `node.json` `dependencies` field.
2. If using a custom node, ensure all dependencies are declared.
3. For marketplace nodes, try uninstalling and reinstalling the node.

---

## Deployment succeeds but Worker behaves unexpectedly

**Cause:** The generated code is valid but has a logic error introduced by an expression or custom Step code.

**Fix:**

1. Click **View Generated Code** in the workflow toolbar (or fetch the version via API).
2. Review the generated TypeScript for obvious errors.
3. Check that all `<span v-pre>&#123;&#123;expression&#125;&#125;</span>` references resolve to the correct values.
4. Add console.log statements to Step nodes to debug (visible in Cloudflare Worker logs). Remove them before the final deploy.

---

## Checking wrangler version

To check which version of wrangler AwaitStep is using:

```bash
docker compose exec awaitstep wrangler --version
```

If you need a specific wrangler version, override the image or build from source with the desired version pinned.
