---
name: version-node
description: Add a new version of an existing AwaitStep registry node using the overrides method (no file duplication)
disable-model-invocation: true
argument-hint: '[node_id] [new_version]'
---

You are bumping an existing registry node to a new version. Use the **overrides method** — the node config lives in `base.json` at the node root, and each version contributes a small `overrides.json` with only what changes. **Do not duplicate the full schema.**

The canonical reference is `registry/nodes/google-gemini/` — match its file structure 1:1.

---

## Step 1: Validate inputs

The node ID is `$1` and the new version is `$2`.

If either is missing, ask the user.

Validate:

1. `registry/nodes/<node_id>/` must exist.
2. `<new_version>` must be valid semver and greater than every existing version directory under that node.
3. `<new_version>/` must NOT already exist.

If the node currently has only `<version>/node.json` and no `base.json` at the node root, the node is on the **legacy single-version layout**. Migrate it first (Step 2). Otherwise skip to Step 3.

## Step 2: Migrate to overrides layout (only if `base.json` is missing)

Read `registry/nodes/<node_id>/<existing_version>/node.json`. Split it:

- **`registry/nodes/<node_id>/base.json`** — every field EXCEPT `version` and `description`.
- **`registry/nodes/<node_id>/<existing_version>/overrides.json`** — `{ "version": "...", "description": "..." }`.

Leave the existing `<existing_version>/node.json` and `<existing_version>/template.ts` untouched. CI rebuilds `node.json` from base+overrides on the next push to `main`.

## Step 3: Add the new version

Create exactly these files (no others):

### `registry/nodes/<node_id>/<new_version>/overrides.json`

```json
{
  "version": "<new_version>",
  "description": "<updated one-line description>",
  "configSchema": {
    "<newOrChangedField>": {
      ...
    }
  }
}
```

Rules for `overrides.json`:

- Always include `version` and `description`.
- Include only the fields that **change** or are **added**. Do NOT re-list unchanged config fields — `deepMerge` (see `registry/scripts/merge.ts`) layers overrides on top of `base.json` recursively.
- For nested objects (e.g. `configSchema.<field>`), include only the keys that differ; the rest are inherited from base.
- To override an array (e.g. `tags`, `configSchema.action.options`), supply the full replacement array — arrays are not merged element-wise.

### `registry/nodes/<node_id>/<new_version>/template.ts`

Copy from the previous version and apply the behavior change. Templates are per-version — there is no template inheritance.

## Step 4: Do NOT generate node.json or index.json locally

The CI workflow `.github/workflows/registry-index.yml` runs `registry/scripts/build-index.ts` on push to `main`. It:

1. Merges `base.json` + each version's `overrides.json` and writes the resulting `<version>/node.json`.
2. Computes checksums and rewrites `registry/index.json`.
3. Opens an auto-merge PR with the regenerated files.

If you generate these locally, checksums will diverge from CI's output and cache-invalidation issues follow. Just commit `base.json`, `overrides.json`, and `template.ts`.

## Step 5: Validate locally without building

- Confirm the JSON files parse: `node -e "require('./registry/nodes/<id>/base.json'); require('./registry/nodes/<id>/<new_version>/overrides.json')"`.
- Diff your file tree against `registry/nodes/google-gemini/` — same shape, minus the CI-generated `<new_version>/node.json`.

Do NOT run `npx tsx registry/scripts/build-index.ts`.

## Step 6: Branch, commit, PR

- Branch from `origin/dev`: `feat/<node_id>-<short-summary>` (e.g. `feat/direct-mail-from-alias`).
- Commit prefix: `feat:` for new user-facing config fields, `fix:` for behavior corrections in the new version, `chore:` for pure metadata bumps.
- Stage only the new/changed files (`base.json`, `<version>/overrides.json`, `<version>/template.ts`, and migrated overrides for the legacy version if Step 2 ran).
- Do NOT stage `<version>/node.json` or `registry/index.json` — those are CI's job.
- Open the PR against `dev`.

## Reference

- Canonical example: `registry/nodes/google-gemini/`
- Merge logic: `registry/scripts/merge.ts`
- Build pipeline: `registry/scripts/build-index.ts`
- CI workflow: `.github/workflows/registry-index.yml`
