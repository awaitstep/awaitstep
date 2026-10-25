# API Reference

All endpoints require authentication via API key (`Authorization: Bearer ask_...`) or session cookie.

API keys are scoped: `read` (queries), `write` (create/update/delete), `deploy` (deploy/trigger/takedown/run control). All keys require at least `read` scope.

A key is also **project-level or organization-level, never both**. A project key works on its project's workflows and variables and reads org-level resources, but organization-level mutations — connections, projects, marketplace nodes, org-wide environment variables, moving a workflow between projects — answer `403` to it. An organization-level key (created without a `projectId`) manages those org resources and may mint project keys, but is refused on every project-scoped route, reads included.

Base URL: `https://app.awaitstep.dev/api` (cloud) or `http://localhost:8080/api` (self-hosted, adjust to match your instance URL)

## Rate Limits

| Scope                   | Limit               |
| ----------------------- | ------------------- |
| Global                  | 200 req/min per IP  |
| Write operations        | 30 req/min per user |
| Deploy operations       | 10 req/min per user |
| Credential verification | 10 req/min per user |

Request bodies are capped at **1 MB** across all API routes. A larger one is
rejected with `413` and `{ "error": "Request body exceeds 1048576 bytes" }`
before the endpoint's own limits are considered.

---

## Pagination

All list endpoints support cursor-based pagination via query parameters:

| Param    | Type    | Default | Description                                          |
| -------- | ------- | ------- | ---------------------------------------------------- |
| `cursor` | string  | —       | Cursor from a previous response's `nextCursor` field |
| `limit`  | integer | 50      | Number of items per page (1–100)                     |

Paginated responses return:

```json
{
  "data": [...],
  "nextCursor": "abc123_2026-03-29T10:00:00.000Z"
}
```

When `nextCursor` is `null`, there are no more pages. Pass the `nextCursor` value as the `cursor` query parameter to fetch the next page.

---

## Workflows

### `GET /workflows`

List all workflows in the active project.

**Scope:** `read`

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

### `GET /workflows/:id`

Get a single workflow by ID.

**Scope:** `read`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

### `GET /workflows/:id/full`

Get a workflow with its current version, all version summaries, and active deployment. `handlers` reports the project's handler modules (`modules`, `consumedQueues`); while a project still has the legacy `handlers.ts` file, `workflow.triggerCode` carries its contents, and once it uses modules `triggerCode` is `null` (see [Project files](#project-files)).

**Scope:** `read`

| Param     | In    | Required | Description                 |
| --------- | ----- | -------- | --------------------------- |
| `id`      | path  | yes      | Workflow ID                 |
| `version` | query | no       | Specific version ID to load |

### `POST /workflows`

Create a new workflow or script.

**Scope:** `write`

```json
{
  "name": "My Workflow",
  "description": "",
  "kind": "workflow"
}
```

| Field         | Required | Description                                                                                                                                                                                                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Display name                                                                                                                                                                                                                                                                  |
| `description` | no       | Optional description                                                                                                                                                                                                                                                          |
| `kind`        | no       | `"workflow"` (default) or `"script"`. Scripts are fetch-only Cloudflare Workers — they have no durable runtime, no instance lifecycle, and no Runs. Set at create time only; cannot be changed via `PATCH`. See [Scripts](#scripts) for constraints and invocation semantics. |

### `PATCH /workflows/:id`

Update a workflow's name, description, environment variables, trigger code, dependencies, or deploy config.

**Scope:** `write`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

```json
{
  "name": "Updated Name",
  "description": "optional",
  "envVars": [{ "name": "KEY", "value": "val", "isSecret": false }],
  "triggerCode": "optional trigger code string",
  "dependencies": { "lodash": "^4.0.0" },
  "deployConfig": {
    "route": {
      "pattern": "api.example.com/my-workflow/*",
      "zoneName": "example.com"
    }
  }
}
```

### `PATCH /workflows/:id/move`

Move a workflow to another project within the same organization. Returns
`warnings` naming any `{{global.env.X}}` reference the destination cannot
satisfy — checked across both project and organization scope, the same way
a deploy resolves them.

**Scope:** `write` — session only: a move crosses project boundaries, so a
project-scoped API key answers `403`.

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

```json
{
  "targetProjectId": "project-id"
}
```

### `DELETE /workflows/:id`

Delete a workflow.

**Scope:** `write`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

---

## Scripts

Scripts share the workflow record (same routes, same versioning) but compile to a **fetch-only** Cloudflare Worker instead of a `WorkflowEntrypoint`. They are designed for stateless transform-and-forward use cases — webhooks, HTTP proxies, simple request handlers.

A script is just a workflow with `kind: "script"`. Set at create time:

```json
POST /workflows
{ "name": "Webhook Forwarder", "kind": "script" }
```

The `kind` field is immutable after creation.

### Constraints

Scripts run inside an `async fetch(request, env)` handler with no durable runtime, so the IR has tighter rules than a workflow:

| Constraint                 | Detail                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger must be HTTP       | Script IR requires `trigger: { type: "http" }`. Cron, event, and manual triggers are not allowed — invocation is always an HTTP request to the deployed Worker URL.                                             |
| No durable-runtime nodes   | `sleep`, `sleep_until`, and `wait_for_event` are rejected at validation time. They require a durable instance the script doesn't have. Use a workflow if you need any of these.                                 |
| No `WORKFLOW` self-binding | The generated Worker has no Workflow binding to itself (it isn't a Workflow). Sub-workflow bindings (calls into other deployed workflows) and resource bindings (KV/D1/R2/etc.) are still detected and emitted. |
| No instance lifecycle      | No Runs, no pause/resume/terminate. `POST /workflows/:id/trigger` returns 400 for scripts. Each HTTP request is a fresh invocation.                                                                             |

### Fetch handler shell

The compiled Worker has two parts: an auto-generated `runGraph(env, event)` function that runs the node graph, and a user-editable fetch handler body that decides what to do with its outputs. The default body is:

```js
try {
  if (request.method !== 'POST') {
    return new Response(null, { status: 200 })
  }
  const params = await request.json().catch(() => undefined)
  const event = { payload: params }

  const graph = await runGraph(env, event)

  // ▼ everything below is yours — change the response, add error
  // handling, branch on request shape, etc. Available outputs are on
  // `graph.*` (one entry per step that returns a value).
  return Response.json(graph)
} catch (error) {
  return Response.json({ message: error.message }, { status: 500 })
}
```

Override it by setting `triggerCode` on the workflow (`PATCH /workflows/:id`). Your code is emitted verbatim inside the fetch handler; the `runGraph` function and `graph.*` outputs stay stable across edits.

`event.payload` mirrors the workflow runtime convention so node code referencing `event.payload.X` works unchanged whether deployed as a workflow or a script.

### `EXPORT_` prefix — opt-in graph outputs

By default, **no** node outputs surface on `graph.*` — `runGraph` returns an empty object. To expose a value, prefix the node's display name with `EXPORT_`:

| Node display name   | Surfaces on graph as | Notes                                                                                                                |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Fetch User`        | (not exported)       | Result still flows to downstream nodes via `{{ Fetch_User.result }}` references; just absent from `graph`.           |
| `EXPORT_FetchUser`  | `graph.FetchUser`    | Prefix is stripped — the variable name is the clean identifier.                                                      |
| `EXPORT_DirectMail` | `graph.DirectMail`   | Works for nodes nested inside containers (`branch`, `parallel`, `try_catch`); the value is hoisted out of the block. |

A node with no `EXPORT_` prefix that isn't referenced anywhere else is dropped entirely (`await ...;` instead of `const X = await ...;`) — keeps the generated code lean.

### Invocation

Once deployed, invoke the Worker directly via HTTP:

```
POST https://<your-worker-url>
Content-Type: application/json

{ "anything": "here" }
```

The body is parsed and exposed to nodes as `event.payload`. The response is `Response.json(graph)` by default (or whatever your `triggerCode` returns). `POST /workflows/:id/trigger` is **not** valid for scripts.

---

## Projects

Project mutations (create, rename, delete) are organization-level: a
project-scoped API key answers `403`.

### `GET /projects`

List all projects in the active organization.

**Scope:** `read`

### `POST /projects`

Create a new project.

**Scope:** `write`

```json
{
  "name": "My Project",
  "slug": "my-project",
  "description": ""
}
```

### `PATCH /projects/:id`

Update a project.

**Scope:** `write`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Project ID  |

```json
{
  "name": "Updated Name",
  "description": "optional"
}
```

### `DELETE /projects/:id`

Delete a project.

**Scope:** `write`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Project ID  |

---

## Versions

### `GET /workflows/:workflowId/versions`

List all versions for a workflow.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `GET /workflows/:workflowId/versions/:versionId`

Get a specific version including its IR and generated code.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `versionId`  | path | yes      | Version ID  |

### `POST /workflows/:workflowId/versions`

Create a new version by submitting a workflow IR. The IR is validated and compiled to code.

**Scope:** `write`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "ir": {}
}
```

### `PATCH /workflows/:workflowId/versions/:versionId`

Lock or unlock a version. Locked versions cannot be deployed or deleted.

**Scope:** `write`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `versionId`  | path | yes      | Version ID  |

```json
{
  "locked": true
}
```

### `POST /workflows/:workflowId/versions/:versionId/revert`

Revert to a previous version. Creates a new version with the target version's IR and sets it as the current version.

**Scope:** `write`

| Param        | In   | Required | Description             |
| ------------ | ---- | -------- | ----------------------- |
| `workflowId` | path | yes      | Workflow ID             |
| `versionId`  | path | yes      | Version ID to revert to |

### `DELETE /workflows/:workflowId/versions/:versionId`

Delete a version. Cannot delete the active version, a deployed version, or a locked version.

**Scope:** `write`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `versionId`  | path | yes      | Version ID  |

---

## Source

The IR is the only source of truth. A version's deployable code is generated
from it on demand — the canvas owns `worker.ts`, `nodes/**` and `wrangler.*`,
and nothing stores a copy you could edit in their place. What you write lives
in project files (below), which are folded into every generation, and the
whole bundle is readable here at any time.

### `GET /workflows/:workflowId/source`

Generate the deployable source for a version and return it read-only;
nothing is persisted. Env vars only need to be declared, not set: a workflow whose secrets are
still missing can be viewed and edited, and the deploy is what refuses
until they resolve. A read does attempt the resolution and reports what it
could not satisfy as an `env` diagnostic — names only, never values — so
the problem is visible before the deploy finds it.

**Scope:** `read`

| Param        | In    | Required | Description                           |
| ------------ | ----- | -------- | ------------------------------------- |
| `workflowId` | path  | yes      | Workflow ID                           |
| `versionId`  | query | no       | Version to read (defaults to current) |

A read never refuses because the workflow is broken: a workspace has to open
before anyone can fix what is wrong with it. An IR that fails validation, a
node this provider cannot deploy, and code that does not parse all still
return `200`, with what was found listed in `diagnostics`:

```json
{
  "diagnostics": [
    {
      "source": "ir",
      "nodeId": "call",
      "message": "Call Script node \"call\" has no worker selected"
    },
    {
      "source": "compile",
      "path": "worker.ts",
      "message": "Unexpected token, expected \";\" (16:21)"
    }
  ]
}
```

`source` is one of:

|            |                                                                              |
| ---------- | ---------------------------------------------------------------------------- |
| `ir`       | the workflow itself — fix it on the canvas                                   |
| `provider` | the node cannot deploy here                                                  |
| `compile`  | the file does not parse; `path` names it                                     |
| `import`   | an `#app/` specifier with no file behind it; `path` names the importing file |
| `env`      | a variable with no value to resolve at deploy; names only, never values      |

The array is empty for a healthy workflow and always present. Only a
failure that leaves no source to return — generation itself throwing — is
still an error response, and it carries the diagnostics collected before it.

Returns `{ versionId, entry, files, manifest, diagnostics }`.

### `POST /workflows/:workflowId/source/check`

Everything `GET /source` finds, without the source. Built for the question
an agent asks after every edit — _did that work?_ — where fetching the whole
bundle to read a verdict is the wrong trade.

**Scope:** `read`

| Param        | In    | Required | Description                                       |
| ------------ | ----- | -------- | ------------------------------------------------- |
| `workflowId` | path  | yes      | Workflow ID                                       |
| `versionId`  | query | no       | Version to check (defaults to current)            |
| `files`      | body  | no       | Candidate files, `[{ path, source }]` (see below) |

The body is optional — no body at all checks what is stored:

```bash
curl -X POST "$API/workflows/$WF/source/check" -H "Authorization: Bearer $KEY"
```

```json
{
  "ok": false,
  "versionId": "v_2b…",
  "checked": ["ir", "provider", "env", "compile", "import"],
  "diagnostics": [
    {
      "source": "import",
      "path": "lib/orders.ts",
      "message": "Cannot resolve \"#app/lib/retry\" — no project file matches it"
    }
  ]
}
```

`checked` lists what actually ran, in order. It never contains a type
check — there isn't one yet, and an agent should not have to guess that.
`diagnostics` uses the same shape and the same `source` values as
`GET /source` (table above).

**A broken workflow is an answer, not an error.** A cycle, a file that will
not parse, a missing secret: all `200` with `ok: false`. Non-2xx is reserved
for "the check could not run" — unknown workflow or version (`404`), no
version at all (`400`), or candidates that were refused (below).

#### Candidate files

`files` overlays files the check should judge **instead of** what is stored.
Nothing is written, and nothing is kept:

```json
{
  "files": [
    { "path": "lib/retry.ts", "source": "export const retry = 3" },
    { "path": "lib/old.ts", "source": null }
  ]
}
```

`source: null` asks what deleting a file would break — the edit most likely
to orphan an import. The set is judged as a unit, so two files that are only
valid together pass together.

Candidates are judged by the rules the matching write path applies, so a
check cannot bless what a save would refuse:

| Version           | Candidates merge into | Judged by                                                       |
| ----------------- | --------------------- | --------------------------------------------------------------- |
| the current one   | the project-file set  | `validateProjectFiles` plus the per-file write rules            |
| any older version | — refused with `400`  | nothing to overlay: older versions deploy their frozen snapshot |

A refused candidate returns `422` with the reason (and `details` when the
rule reports more than one) — or `400` for an older version, which no write
could reach either. A **locked** version is not refused: a lock pins what is
deployed, while project files belong to the workflow rather than to a
version, so `PUT`/`DELETE /files` never consult it and neither does this. A problem the project **already** has
in storage is not a refusal: it comes back as a diagnostic in the `200`, so a
file that predates a rule cannot block every check that follows.

The caps are the storage caps — at most 100 files, 512 KB each, the project
total — under the same 1 MB request-body limit as every other route.

---

## Project files

For the conventions in prose — the `#app/` import model, handler modules, the
ETag rules and a worked end-to-end pass — see the
[Project Files guide](https://docs.awaitstep.dev/api/project-files). This
section is the per-endpoint reference.

A workflow is a small project: beside the code the canvas generates
(`worker.ts`, `nodes/**`, `wrangler.*`) it owns any files you create — code in
any folder (`config/env.ts`, `services/stripe/client.ts`), data and docs
(`data/countries.json`, `README.md`), and the standard root config files
(`package.json`, `tsconfig.json`). Folders exist implicitly through file
paths. Nothing touches a disk until deploy, when every file is written beside
the generated code.

**Imports.** Use plain relative paths, or the `#app/` alias for the project
root from anywhere: `import { region } from '#app/config/env'` reaches
`config/env.ts` from the entry, a generated step module, or another project
file. Omit the extension for `.ts`/`.js` files; name data and
explicit-extension files in full (`#app/data/countries.json`,
`#app/legacy.mjs`, `#app/legacy.mts`). The deployed `package.json` carries
the matching `imports` map (one pattern per extension), so wrangler
(esbuild) and `wrangler dev` resolve it natively, and `#app/` is a valid Node
subpath-import prefix, so the same code runs under Node tooling too.

**Handler modules.** The entry handlers are plain ES modules under
`handlers/`, each with a default export, and the filename is the only fact
the deploy reads from them:

| File                        | Export                                     | Declares                                                  |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `handlers/fetch.ts`         | `(request, env, ctx) => Promise<Response>` | the HTTP entry (the default scaffold is used when absent) |
| `handlers/queue/<queue>.ts` | `(batch, env, ctx) => Promise<void>`       | a consumer of `<queue>` (lowercase letters, digits, `-`)  |
| `handlers/scheduled.ts`     | `(controller, env, ctx) => Promise<void>`  | the handler for every cron trigger of the workflow        |

The generated `worker.ts` imports whichever exist and wires them into its
`export default`; a script also exports `runGraph` so `handlers/fetch.ts`
can `import { runGraph } from '#app/worker'`. Nothing is parsed out of
code: the queue binding, cron expressions (the workflow's cron trigger
plus `deploymentConfig.cronTriggers`) and per-queue settings
(`deploymentConfig.queueConsumers`) stay declared. A `handlers/scheduled.ts`
without a schedule, or schedules without the module, fail the deploy with
a message naming the missing half. Helpers may live under `handlers/` too,
and `handlers/shared.ts` is special: the generated entry re-exports it, so
anything the runtime must find on the Worker (a Durable Object class, say)
belongs there. Writes are refused (`422`) for a path that merely looks like
an entry (`handlers/Fetch.ts`, a queue file whose name is not a valid queue
name), since it would silently never run, and for a second file naming an
entry another file already provides. Those are write-time rules only:
versions stored before the convention keep validating and deploying.
`GET /workflows/:id/full` reports
`handlers.modules` and `handlers.consumedQueues`. The code workspace and the
canvas's bindings panel create consumer modules; the annotation file below
and the folder never coexist (`422` on either write).

**handlers.ts (legacy).** The entry handlers — `@fetch`, `@queue` and `@scheduled`
functions in the annotation syntax the trigger-code setting uses — as a
project file. When it exists it _is_ the trigger code: deploys, queue/cron
detection, the generated `worker.ts` and the canvas all read it, and the
legacy `triggerCode` setting is ignored (the `full` workflow response
returns the file's contents as `triggerCode` so existing clients keep
working). It is compiled into the entry and never shipped as a module, so
it may not `import` other files; put shared code in a module and reach it
from a generated step instead. The code workspace offers it (seeded from
the setting) until it is saved for the first time; the canvas never writes
trigger code itself, it only mirrors this file.

**package.json.** Write it like any Node package. The deploy honours `name`,
`version`, `description`, `license`, `engines`, your own `#`-prefixed
`imports` entries and `dependencies` (registry ranges only — the same rule
the dependencies setting follows; when a project manifest exists it replaces
that setting entirely). It always forces `private`, `"type": "module"`, the
`#app/` map, and merges dependencies required by installed nodes; `scripts`,
`workspaces`, `overrides` and similar are dropped, and installs run with
`--ignore-scripts`. A root `tsconfig.json`/`jsconfig.json` is kept for the
editor's type program and is never written to the deploy directory: the
code workspace honours its strictness switches (`strict`, `noImplicitAny`,
`strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns`, `checkJs` and the like), while `paths`, `lib`,
`types`, `module` and resolution settings are fixed by the workspace.

**Versions.** The project-file table is the source of truth: writes land
immediately, every `POST /versions` snapshots the current set into the
version's IR (`runtime.files`), an IR that arrives with files before the
table has any (an import) seeds it, inline `runtime.triggerCode` /
`runtime.dependencies` seed `handlers.ts` / `package.json` when the project
has none (and are dropped from the stored IR once those files exist, so a
stale copy can never come back through a version), and a revert replaces
the table with the reverted version's snapshot. `GET /source` marks each
project-owned file with its `hash`, the ETag a conditional write needs. A
deploy of the current version uses the live set, and older versions deploy
exactly what they snapshotted.

**Limits.** 100 files, 512 KB per file, 2 MB in total — but every API
request body is capped at **1 MB** (see [Rate Limits](#rate-limits)), and a
larger one is rejected with `413` before any of these apply. So the 2 MB
project total is reached across several requests, never in one, and a single
file near 512 KB has to be sent on its own. Paths use
`[A-Za-z0-9._-]` segments (no dotfiles, no `..`), may not be generated paths
(`worker.*`, `nodes/**`, `wrangler.*`, in any case), lockfiles or
`node_modules`, may hold `package.json`/`tsconfig.json`/`jsconfig.json` only
at the root, must not collide with another file after compile or on a
case-insensitive disk (`a.ts` vs `a.js`, `Env.ts` vs `env.ts`), and end in a
code (`ts js mts cts mjs cjs`) or asset (`json md txt toml yaml yml css html
sql`) extension. Code is transpiled and bundled; assets are written as-is.

### `GET /workflows/:workflowId/project`

The file tree with content hashes plus the conventions above — poll this to
know whether anything changed before reading or writing.

**Scope:** `read`

Returns `{ importPrefix: "#app/", generated: ["worker.*", "nodes/**", "wrangler.*"], rootConfigFiles, extensions, limits: { maxFiles, maxFileBytes, maxTotalBytes }, files: [{ path, hash, size, updatedAt }] }`.

### `GET /workflows/:workflowId/files/:path`

**Scope:** `read`

| Param  | In   | Required | Description                            |
| ------ | ---- | -------- | -------------------------------------- |
| `path` | path | yes      | Project-relative, e.g. `config/env.ts` |

Returns `{ path, hash, size, updatedAt, source }` with an `ETag` header equal to
`"<hash>"`.

### `PUT /workflows/:workflowId/files/:path`

Create or replace a file (folders are created implicitly). Send
`If-Match: "<hash>"` from a previous read to make the write conditional (`*`
means "must already exist"), or `If-None-Match: *` to create only (the write
fails if the path is taken); on a failed precondition the response is `409`
with `{ error, currentHash }` and nothing is written. Sending both headers is
a `400`. A `package.json` is checked against the contract above before it is
stored.

**Scope:** `write`

| Param    | In   | Required | Description              |
| -------- | ---- | -------- | ------------------------ |
| `path`   | path | yes      | Project-relative path    |
| `source` | body | yes      | File contents (≤ 512 KB) |

Returns `201` (created) or `200` (replaced) with `{ path, hash, size, updatedAt }`
and the new `ETag`; `422` (with `details` for a manifest) for invalid paths,
compile collisions, invalid `package.json` or exceeded limits.

### `GET /workflows/:workflowId/project/convert-handlers`

A dry run of the conversion below: `{ source, paths, declarations }` where
`source` is `"file"` (a stored `handlers.ts`), `"setting"` (the legacy
trigger-code setting) or `"version"` (trigger code carried inline in the
current version's IR), and `declarations` is what the annotations declared
that modules cannot carry (for Cloudflare: `crons`, `queueConfigs`,
`queueNames`). `404` when there is nothing to convert.

**Scope:** `read`

### `POST /workflows/:workflowId/project/convert-handlers`

Splits the annotated `handlers.ts` — or, when the project has no such
file, the legacy `triggerCode` setting or the current version's inline
`runtime.triggerCode` — into handler modules, in one request: the
declarations are folded first (applying them twice changes nothing, so a
later failure costs only a retry), then the modules are written together,
then the file is removed (optional `If-Match` against its hash). Module-level
code the handlers shared becomes `handlers/shared.ts`. The legacy setting
is left as it is: versions saved before the conversion still deploy from
it, while the current version uses the modules. The `@crons` /
`@config` facts the annotations carried are folded into the stored
deployment configs of the workflow by the provider (for Cloudflare:
`cronTriggers`, `queueConsumers`; overrides keyed by a handler's old JS name
are renamed to its queue; declared settings win). Should `handlers.ts`
change between the writes, the modules are withdrawn again and the
response is `409` — the project never holds both models. Returns
`{ source, files, declarations, deploymentConfigUpdated }`;
`deploymentConfigUpdated` is false when no deployment config is stored yet,
in which case declare the facts before deploying. `409` when the hash does
not match, or when the project already uses handler modules; `422` when the annotations do not parse or
the resulting set breaks a project rule.

**Scope:** `write`

### `DELETE /workflows/:workflowId/files/:path`

Optional `If-Match` as above. Returns `204`; `404` when the file does not
exist; `409` when the precondition fails.
Deleting `handlers.ts` or `package.json` also clears the legacy setting it
stood in for (`triggerCode` / `dependencies`), so the file does not
reappear as a seed and the next deploy uses the default handlers / no
project dependencies.

**Scope:** `write`

---

## Deployments

### `GET /deployments`

List all deployments across all workflows for the authenticated user.

**Scope:** `read`

### `GET /workflows/:workflowId/deployments`

List deployments for a specific workflow.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `POST /workflows/:workflowId/deploy`

Deploy a workflow version to a connection. Validates environment variables and credentials before deploying.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "connectionId": "connection-id",
  "versionId": "optional-version-id"
}
```

### `POST /workflows/:workflowId/deploy-stream`

Deploy a workflow with real-time progress updates via Server-Sent Events. Same request body as `/deploy`.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "connectionId": "connection-id",
  "versionId": "optional-version-id"
}
```

Progress events follow this sequence:

```
INITIALIZING → GENERATING_CODE → CODE_READY → DETECTING_BINDINGS →
BINDINGS_READY → CREATING_WORKER → DEPLOYING → WORKER_DEPLOYED →
UPDATING_WORKFLOW → COMPLETED
```

### `POST /workflows/:workflowId/trigger`

Trigger an execution of a deployed workflow. Params payload is capped at 100KB.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "connectionId": "connection-id",
  "params": {}
}
```

Created instances use the **instance retention** settings from the workflow's stored deployment config for that connection (`retention.successRetention` / `retention.errorRetention`, a duration like `"7 days"` or milliseconds). When unset, AwaitStep applies a 7-day default for both instead of the Cloudflare account maximum — retained instance state bills at $0.20/GB-month past the included 1 GB. Cloudflare caps retention at the plan maximum (3 days Free, 30 days Paid).

> **Scripts (kind: "script")** have no instance lifecycle — they are stateless fetch-only Workers. Calling this endpoint on a script returns 400. Invoke the deployed Worker URL directly via HTTP POST instead. See [Scripts → Invocation](#invocation) for the request/response shape.

### `POST /workflows/:workflowId/takedown`

Remove a deployment and clear the workflow's active version.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "connectionId": "connection-id"
}
```

---

## Runs

### `GET /runs`

List all runs across all workflows for the authenticated user.

**Scope:** `read`

### `GET /workflows/:workflowId/runs`

List runs for a specific workflow.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `GET /workflows/:workflowId/runs/:runId`

Get a specific run. Run status is reconciled from the provider by a background sync loop (every 5 seconds on the Node server, every minute via cron on Workers), so reads are immediate and never block on provider round-trips.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `GET /workflows/:workflowId/runs/:runId/steps`

Per-step telemetry for a run, collected by the background sync loop: each durable step's label, kind (`do` / `sleep` / `waitForEvent` / `rollback`), status, timing, attempt count, and last error. Steps are attributed to canvas nodes (`nodeId`) through the step manifest recorded at deploy time; generated step labels are derived from node ids, so attribution survives node renames. Loop iterations appear as separate entries (`stepIndex` is the 1-based occurrence per label). Coalesced steps (adjacent plain nodes merged into one billable step) report one record attributed to the group's leader node; the response's `coalescedInto` map (`memberNodeId → leaderNodeId`, read from the deploy manifest) links each member node to that leader, so UIs can show members as having run inside the leader's step. Response shape: `{ data: RunStep[], coalescedInto: Record<string, string> }`. Returns an empty list for runs synced before a manifest-bearing deploy existed or when no steps have been reported yet.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `GET /workflows/:workflowId/runs/:runId/stream`

Live run events as a Server-Sent Events stream. Each tick (every 2s while the run is active) reconciles the run with the provider — writing through to the same store the background sync loop and `GET …/steps` read — and pushes only what changed:

| Event     | Data                                          | Meaning                                                |
| --------- | --------------------------------------------- | ------------------------------------------------------ |
| `run`     | `{ status }`                                  | The run status changed                                 |
| `step`    | `{ name, kind, index, status, attemptCount }` | A step's status or attempt count moved (new steps too) |
| `done`    | `{}`                                          | The run reached a terminal status; the stream closes   |
| `timeout` | `{}`                                          | 10 minutes elapsed; reconnect to keep streaming        |
| `error`   | `{ message }`                                 | The provider could not be reached; the stream closes   |

Clients should keep polling `GET …/steps` as the floor and treat the stream as acceleration — on any close, resume polling or reconnect. The stream ends immediately with `done` for runs with no provider connection.

**Scope:** `read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/pause`

Pause a running workflow instance.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/resume`

Resume a paused workflow instance.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/terminate`

Terminate a running or paused workflow instance.

**Scope:** `deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

---

## Connections

Connection mutations (create, update, delete) are organization-level: a
project-scoped API key answers `403`. Reads stay available to keys — a deploy
needs its connection.

### `GET /connections`

List all connections. Credential values are redacted in the response.

**Scope:** `read`

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

### `POST /connections`

Create a new provider connection.

**Scope:** `write`

```json
{
  "provider": "cloudflare",
  "credentials": { "apiToken": "...", "accountId": "..." },
  "name": "My Connection"
}
```

### `POST /connections/verify-token`

Verify provider credentials before saving. Currently supports the `cloudflare` provider.

**Scope:** `write`

```json
{
  "provider": "cloudflare",
  "credentials": { "apiToken": "..." }
}
```

Returns:

```json
{
  "valid": true,
  "accounts": [{ "id": "abc123", "name": "My Account" }]
}
```

### `PATCH /connections/:id`

Update a connection's name or credentials.

**Scope:** `write`

| Param | In   | Required | Description   |
| ----- | ---- | -------- | ------------- |
| `id`  | path | yes      | Connection ID |

```json
{
  "name": "Updated Name",
  "credentials": { "apiToken": "new-token" }
}
```

### `DELETE /connections/:id`

Delete a connection.

**Scope:** `write`

| Param | In   | Required | Description   |
| ----- | ---- | -------- | ------------- |
| `id`  | path | yes      | Connection ID |

---

## Environment Variables

A project-scoped API key manages only its own project's variables: creating,
updating or deleting an org-wide variable or another project's answers `403`
(create) or `404` (update/delete), and listing another project's variables
answers `404`. Org-wide variables stay readable to keys — they resolve into
the key's project at deploy time.

### `GET /env-vars`

List all global environment variables. Secret values are masked as `••••••••`.

**Scope:** `read`

### `POST /env-vars`

Create a global environment variable. Name must match `^[A-Z][A-Z0-9_]*$`.

**Scope:** `write`

```json
{
  "name": "MY_VAR",
  "value": "my-value",
  "isSecret": false
}
```

### `PATCH /env-vars/:id`

Update an environment variable's name, value, or secret flag. Making a secret
variable non-secret requires a new `value` in the same request — a stored
secret never becomes readable — otherwise the request answers `422`.

**Scope:** `write`

| Param | In   | Required | Description             |
| ----- | ---- | -------- | ----------------------- |
| `id`  | path | yes      | Environment variable ID |

```json
{
  "value": "new-value"
}
```

### `DELETE /env-vars/:id`

Delete an environment variable.

**Scope:** `write`

| Param | In   | Required | Description             |
| ----- | ---- | -------- | ----------------------- |
| `id`  | path | yes      | Environment variable ID |

---

## Resources

All resource endpoints require a `connectionId` query parameter pointing to a valid Cloudflare connection.

### `GET /resources/kv/namespaces`

List KV namespaces.

**Scope:** `read`

| Param          | In    | Required | Description   |
| -------------- | ----- | -------- | ------------- |
| `connectionId` | query | yes      | Connection ID |

### `GET /resources/kv/namespaces/:namespaceId/keys`

List keys in a KV namespace.

**Scope:** `read`

| Param          | In    | Required | Description           |
| -------------- | ----- | -------- | --------------------- |
| `namespaceId`  | path  | yes      | KV namespace ID       |
| `connectionId` | query | yes      | Connection ID         |
| `prefix`       | query | no       | Filter keys by prefix |
| `cursor`       | query | no       | Pagination cursor     |
| `limit`        | query | no       | Max keys to return    |

### `GET /resources/kv/namespaces/:namespaceId/values/:key`

Get the value of a KV key.

**Scope:** `read`

| Param          | In    | Required | Description     |
| -------------- | ----- | -------- | --------------- |
| `namespaceId`  | path  | yes      | KV namespace ID |
| `key`          | path  | yes      | Key name        |
| `connectionId` | query | yes      | Connection ID   |

### `GET /resources/d1/databases`

List D1 databases.

**Scope:** `read`

| Param          | In    | Required | Description   |
| -------------- | ----- | -------- | ------------- |
| `connectionId` | query | yes      | Connection ID |

### `POST /resources/d1/databases/:databaseId/query`

Execute a SQL query against a D1 database.

**Scope:** `read`

| Param        | In   | Required | Description    |
| ------------ | ---- | -------- | -------------- |
| `databaseId` | path | yes      | D1 database ID |

```json
{
  "connectionId": "connection-id",
  "sql": "SELECT 1",
  "params": []
}
```

### `GET /resources/r2/buckets`

List R2 buckets.

**Scope:** `read`

| Param          | In    | Required | Description   |
| -------------- | ----- | -------- | ------------- |
| `connectionId` | query | yes      | Connection ID |

### `GET /resources/r2/buckets/:bucketName/objects`

List objects in an R2 bucket.

**Scope:** `read`

| Param          | In    | Required | Description           |
| -------------- | ----- | -------- | --------------------- |
| `bucketName`   | path  | yes      | Bucket name           |
| `connectionId` | query | yes      | Connection ID         |
| `prefix`       | query | no       | Filter by prefix      |
| `cursor`       | query | no       | Pagination cursor     |
| `limit`        | query | no       | Max objects to return |

---

## Nodes

Node listings merge the organization's installed marketplace nodes into the
registry. The organization comes from the caller — an API key's own, or a
session's `organizationId` query parameter (membership checked; `404` for an
organization the caller is not in). A session that omits it gets the public
registry without any installs. `GET /nodes/:nodeId` resolves against the same
merged set, so installed nodes are found individually too.

### `GET /nodes`

List all available node definitions from the registry.

**Scope:** `read`

### `GET /nodes/templates`

Get node template resolver data.

**Scope:** `read`

### `GET /nodes/:nodeId`

Get a single node definition.

**Scope:** `read`

| Param    | In   | Required | Description  |
| -------- | ---- | -------- | ------------ |
| `nodeId` | path | yes      | Node type ID |

---

## Test Sessions

Run a workflow before deploying it. A session is a disposable worker —
a container in the cloud, a child process when self-hosting — running
`wrangler dev` over the same bundle a deploy would ship. Nothing is deployed
and no provider credentials are involved.

Sessions are **personal and billed**, so every endpoint is scoped to the user
who started one: another member of the same project gets `404`, the same as
for a session that does not exist. They are also **time-boxed** — an idle
window, a hard lifetime, and a cap on how many a user may hold at once — and
a request that arrives after a cut-off stops the session rather than serving
it, answering `410`.

Test runs are never recorded as workflow runs: they have no deployment and
must not appear in run history or per-step telemetry.

When a deployment cannot run sessions at all, every endpoint answers `501`;
when an operator has switched them off, a start answers `503`. Both say so
rather than pretending the route does not exist.

### `POST /workflows/:workflowId/test-sessions`

Starts a session, or returns the one this user already has for the workflow
(`reused: true`, status `200`) — a second click asks for the session you have,
not an error about it.

**Scope:** `write`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

Returns `201` with `{ session, reused: false }`. A session reports its `id`,
`workflowId`, `versionId`, `runtime`, `status`, `error` and clocks; the
container and process behind it are not part of the response.

Refusals: `400` no version to run, `429` the user's concurrency cap or the
project's quota, `502` the worker could not start (the message carries the
worker's own output), `504` the start took longer than the start timeout.

### `GET /workflows/:workflowId/test-sessions`

The live session for this user and workflow, or `{ session: null }`.

**Scope:** `read`

### `POST /test-sessions/:sessionId/trigger`

Invokes the session's `fetch` handler, the way a deployed worker would be
invoked. Body: `{ "payload": { ... } }`, under 100 KB. Returns the worker's
own `{ status, body }`.

**Scope:** `write`

### `GET /test-sessions/:sessionId/stream`

Server-sent events for one session. `logs` carries `{ entries, cursor }`;
pass the cursor back as `after` to continue where you left off — it is opaque
and must not be parsed. `instance` carries the status of the run named by
`instanceId`, when given, and is sent only when it changes. `closed` ends the
stream and carries `{ final, reason }`: `final: true` means the session itself
is over and reconnecting would only return `410`; `final: false` means the
stream reached its own five-minute limit and the client should reconnect from
its cursor. Act on `final`, not on the wording.

Holding the stream open counts as using the session, so a run is never reaped
mid-flight.

**Scope:** `read`

| Param        | In    | Required | Description                       |
| ------------ | ----- | -------- | --------------------------------- |
| `sessionId`  | path  | yes      | Session ID                        |
| `after`      | query | no       | Cursor from the last `logs` event |
| `instanceId` | query | no       | Also stream this run's status     |

### `DELETE /test-sessions/:sessionId`

Stops the worker and closes the session. Stopping one that has already
stopped is not an error — the container may still exist even when the record
says otherwise.

**Scope:** `write`

## Marketplace

Installing, uninstalling and updating nodes are organization-level actions: a
project-scoped API key answers `403`.

### `GET /marketplace`

Get the full marketplace catalog with installation status for the current organization.

**Scope:** `read`

### `GET /marketplace/:nodeId`

Get details for a specific marketplace node, including available versions and installation status.

**Scope:** `read`

| Param    | In   | Required | Description                                  |
| -------- | ---- | -------- | -------------------------------------------- |
| `nodeId` | path | yes      | Node ID (alphanumeric, hyphens, underscores) |

### `GET /marketplace/installed`

List installed marketplace nodes for the current organization.

**Scope:** `read`

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

### `POST /marketplace/install`

Install a node from the marketplace.

**Scope:** `write`

```json
{
  "nodeId": "stripe",
  "version": "1.0.0"
}
```

`version` is optional — defaults to the latest available version.

### `POST /marketplace/uninstall`

Uninstall a previously installed node.

**Scope:** `write`

```json
{
  "nodeId": "stripe"
}
```

### `POST /marketplace/update`

Update an installed node to a newer version.

**Scope:** `write`

```json
{
  "nodeId": "stripe",
  "version": "1.1.0"
}
```

`version` is optional — defaults to the latest available version.

---

## Session-Only Endpoints

These endpoints require session authentication and are **not accessible via
API key** — with one exception: an organization-level key may `POST /api-keys`
to mint project keys.

### `GET /api-keys`

List the organization's live API keys — revoked keys are never returned. Each
project-level key carries its project's name as `projectName` (null on
organization-level keys).

| Param       | In    | Required | Description                                                 |
| ----------- | ----- | -------- | ----------------------------------------------------------- |
| `projectId` | query | no       | List only this project's keys (must be in the organization) |
| `cursor`    | query | no       | Pagination cursor                                           |
| `limit`     | query | no       | Items per page (1–100, default 50)                          |

### `POST /api-keys`

Create a new API key. The full key is returned only once in the response.

A key is **project-level or organization-level, never both**: with `projectId`
it works that project's workflows and variables; without, it manages
organization resources (projects, connections, marketplace, org-wide
variables) and is refused on every project route. Organization-level keys can
only be created from a session; an organization-level key may create project
keys (`403` when it tries to create another org key). A key never mints past
itself: the new key's scopes must be a subset of the caller's (`403`
otherwise) and its expiry is capped at the caller's own. A key minted by
another key records it as `parentKeyId` and stops working (`401`) when that
key is revoked or expires. Keys stop working when their creator leaves the
organization.

```json
{
  "name": "My Key",
  "projectId": "project-id",
  "scopes": ["read", "write"],
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

`projectId` and `expiresAt` are optional — omit `projectId` for an
organization-level key.

### `DELETE /api-keys/:id`

Revoke an API key. Revoking an organization-level key also stops every key it
minted.
