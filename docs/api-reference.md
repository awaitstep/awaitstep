# API Reference

All endpoints require authentication via API key (`Authorization: Bearer ask_...`) or session cookie.

An API key is minted at one **level** and carries a **grid** of permissions — the resources it may touch and the actions it may take on them — from the catalog of that level (the Create key dialog shows the same grid):

| Level        | Reaches                                                                       | Resources (actions)                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| organization | the organization's settings, never a workflow                                 | `projects` (read, write, delete) · `members` (read) · `connections` (read, write, delete) · `resources` (read, write, delete: nodes, the marketplace and org-wide variables) · `audit` (read) |
| project      | everything in one project, every workspace of it, ones created later included | `workspaces` (read, write, delete) · `workflows` (read, write, delete, deploy, run) · `runs` (read) · `variables` (read, write, delete) · `members` (read)                                    |
| workspace    | one workspace of a project                                                    | `workflows` (read, write, delete, deploy, run) · `runs` (read) · `variables` (read, write, delete)                                                                                            |

Every endpoint below names the cell it needs as **Permission:** `resource:action`; a key without it answers `403 API key lacks permission: resource:action`. A key of a level the resource is not offered at is refused for its level (`403`): an organization key never reaches a project route, a project or workspace key never manages organization resources. Project and workspace keys may still read the connections and nodes their workflows deploy with through their own `workflows:read` cell, and what their workflows resolve against through `GET /env-vars/resolved` with `variables:read`. A workspace key is pinned to its workspace: every list is cut to it, a workflow elsewhere is not found, and naming another workspace is `404`.

A key acts with the standing of whoever minted it: a key minted by a Viewer cannot edit workflows, and a key minted by someone who does not manage a level cannot set its variables, whatever its grid; a key stops working (`401`) when its creator leaves the organization or can no longer open the key's project or workspace. Keys never manage keys: listing, minting and revoking them take a session (see the end of this document).

Base URL: `https://app.awaitstep.dev/api` (cloud) or `http://localhost:8080/api` (self-hosted, adjust to match your instance URL)

## Addressing scope

Project-scoped routes take the project as `?projectId=<id>`, or as the slugs the dashboard's URLs carry: `?org=<org slug>&project=<project slug>`. Either way the project and your membership are resolved in one read; a project you are not a member of answers `404`, exactly like one that does not exist. Organization-scoped routes take `?organizationId=<id>` or `?org=<slug>`.

A workspace can be named on any project-scoped route with `?workspaceId=<id>` or `?workspace=<slug>`. It must be the project's; otherwise `404`. API keys carry their project, so they omit the project parameters and may still name a workspace; a workspace key names only its own, or none. A key that does name a project — by id or slug — names its own, or answers `404`: it is never answered from its own project for a request that asked for another. An empty parameter counts as none.

## Rate Limits

| Scope                   | Limit               |
| ----------------------- | ------------------- |
| Global                  | 200 req/min per IP  |
| Write operations        | 30 req/min per user |
| Deploy operations       | 10 req/min per user |
| Credential verification | 10 req/min per user |
| Image uploads           | 10 req/min per user |
| Serving images          | 600 req/min per IP  |

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

| Param                       | In    | Required | Description            |
| --------------------------- | ----- | -------- | ---------------------- |
| `workspace` / `workspaceId` | query | no       | Only this workspace's  |
| `kind`                      | query | no       | `workflow` or `script` |

Each row carries `workspaceId`, `deployedVersion` (the version number the
latest deployment put live, or null), `recentRunStatuses` (the last ten
finished runs, newest first) and `sharing` (`{ sharedAt, sharedBy: { id, name } }`
while it is shared to the project, else null). Workflow rows, here and on
`GET /workflows/:id`, also carry the raw `sharedBy` (a user id) and `sharedAt`
columns.

**Permission:** `workflows:read`

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

A `cursor` is the `nextCursor` of the previous page; anything else (or one
naming an impossible time) answers `422` on every paginated list.

### `GET /workflows/:id`

Get a single workflow by ID.

**Permission:** `workflows:read`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

### `GET /workflows/:id/full`

Get a workflow with its current version, all version summaries, and active deployment. `handlers` reports the project's handler modules (`modules`, `consumedQueues`); while a project still has the legacy `handlers.ts` file, `workflow.triggerCode` carries its contents, and once it uses modules `triggerCode` is `null` (see [Project files](#project-files)).

**Permission:** `workflows:read`

| Param     | In    | Required | Description                 |
| --------- | ----- | -------- | --------------------------- |
| `id`      | path  | yes      | Workflow ID                 |
| `version` | query | no       | Specific version ID to load |

### `POST /workflows`

Create a new workflow or script.

**Permission:** `workflows:write`

```json
{
  "name": "My Workflow",
  "description": "",
  "kind": "workflow",
  "workspaceId": "ws_..."
}
```

`workspaceId` is optional: else the `workspace`/`workspaceId` query
parameter, else the project's oldest workspace. One that is not the
project's answers `404`.

| Field         | Required | Description                                                                                                                                                                                                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Display name                                                                                                                                                                                                                                                                  |
| `description` | no       | Optional description                                                                                                                                                                                                                                                          |
| `kind`        | no       | `"workflow"` (default) or `"script"`. Scripts are fetch-only Cloudflare Workers — they have no durable runtime, no instance lifecycle, and no Runs. Set at create time only; cannot be changed via `PATCH`. See [Scripts](#scripts) for constraints and invocation semantics. |

### `PATCH /workflows/:id`

Update a workflow's name, description, environment variables, trigger code, dependencies, or deploy config.

**Permission:** `workflows:write`

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

The workflow lands in the target project's oldest workspace. A share to
the old project does not follow it: it arrives unshared.

Move a workflow to another project within the same organization. Returns
`warnings` naming any `{{global.env.X}}` reference the destination cannot
satisfy — checked across both project and organization scope, the same way
a deploy resolves them.

**Permission:** session only — a move crosses project boundaries, so any API
key answers `403`.

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

```json
{
  "targetProjectId": "project-id"
}
```

### `PUT /workflows/:id/share`

Share a workflow or function to its project, or stop. A shared item is
listed to everyone in the project — `GET /projects/:id/shared` and the
other workspaces' `GET /workspaces/:id/shared` — and is what a Call
Workflow step will pick from. Sharing shows **what it is, not the item**:
its name, kind, deployed version, workspace and who shared it. Someone
who cannot open its workspace still cannot read its graph, code, variables
or runs (`GET /workflows/:id` stays `404` for them).

The caller needs `share` in the workflow's own workspace (its admins and
editors; a viewer answers `403` "Only Editors can share"). Sharing one
already shared keeps who shared it and when; unsharing one that isn't is a
no-op. Moving it to another workspace in the project keeps the share. The
write holds to the workspace the caller was judged on: if the workflow moves
while the request is in flight it answers `409` "Something changed meanwhile.
Reload and try again" and changes nothing.

**Permission:** `workflows:write`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Workflow ID |

```json
{ "shared": true }
```

Response: `{ "sharing": { "sharedAt": "2026-10-29T10:00:00.000Z", "sharedBy": { "id": "usr_...", "name": "Ama Mensah" } } }`,
or `{ "sharing": null }` when off.

### `DELETE /workflows/:id`

Delete a workflow.

**Permission:** `workflows:delete`

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

Every project has at least one workspace. `POST /projects` creates the
project together with its `Default` workspace (both or neither) and returns
it as `defaultWorkspace`. Listed projects carry what the dashboard shows:
`workspaces` (id, slug, name, colour; oldest first), `health` (workflow,
deployed and failing counts, last run), `lock`, `members` (sessions only; a
key gets an empty list) and the caller's `viewerRole` and `viewerCan`.

Who sees a project: the organization's owners and admins, its project
members, and anyone with a role in one of its workspaces. Everyone else gets
`404` on it, and its counts and lists leave it out. Renaming (`PATCH`, which
also takes `slug`) and deleting a project is for its admins (org owners and
admins, or a `project_members` row with `admin`); any member may create one,
and becomes its admin unless they run the organization. A key acts with the
standing of whoever minted it, so a member's key is refused too. Item routes
(`/projects/:id`, `/projects/:id/move`) need no `org` parameter: the project
carries its organization.

Slugs are lowercase letters, digits and inner hyphens, up to 100 characters,
and may not be a page the dashboard already serves at that level
(`settings`, `account`, `items`, `projects`, `resources`, `audit`, `inbox`,
`whats-new`). Such a slug answers `422`.

### `GET /projects`

The projects in the organization the caller can open, each with the
workspaces, health and people the caller may see. `viewerRole` is `admin`,
`member`, or `null` for someone who reaches the project through a workspace
grant alone.

**Permission:** `projects:read`

### `POST /projects`

Create a new project.

**Permission:** `projects:write`

```json
{
  "name": "My Project",
  "slug": "my-project",
  "description": ""
}
```

### `PATCH /projects/:id`

Update a project.

**Permission:** `projects:write`

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

Delete a project with its workspaces and workflows. Refused with `409` and
nothing deleted while the project is locked ("Turn off the deletion lock
first") or while a workspace in it is locked on its own ("Sales is locked";
"2 workspaces in it are locked").

**Permission:** `projects:delete`

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Project ID  |

### `PUT /projects/:id/lock`

Session only (an API key answers `403`, whatever it holds): a key that may
delete must not be able to lift the lock first. Turns the project's
deletion lock on or off (project admins: org owners and admins, or a
`project_members` row with `admin`). While it is on, the project cannot be
deleted or moved to another organization, and none of its workspaces can be
deleted. Turning on a lock that is already on keeps who set it and when;
turning off one that is off is a no-op. The lock guards the project and its
workspaces themselves, not what is in them: workflows, versions, keys and
variables inside are still edited and deleted as their own permissions allow.

```json
{ "locked": true }
```

Response: `{ "lock": { "setBy": { "id": "usr_...", "name": "Ama Mensah" }, "setAt": "2026-10-29T10:00:00.000Z" } }`,
or `{ "lock": null }` when off.

### `GET /projects/:id/setup`

Session only (an API key answers `403`). What the project has set up, for its
empty pages: one statement.

| Param | In   | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id`  | path | yes      | Project ID  |

```json
{ "cloudflareConnected": true, "orgVariables": 2, "projectVariables": 1, "projectKeys": 0 }
```

- `cloudflareConnected`: a Cloudflare connection serves the project (every
  project, or it is on the list) and its token isn't `invalid` or past its expiry.
- `orgVariables`: organization variables the project inherits — those it doesn't
  set itself. `projectVariables`: variables set at the project.
- `projectKeys`: project-level keys not revoked and not expired.

A project the caller can't open answers `404`.

### `GET /projects/:id/shared`

Session only (an API key answers `403`). The project's Shared library:
every workflow and function shared to the project, newest share first.
Anyone who can open the project reads it, including items whose workspace
they cannot open — the item's name and its workspace's name and colour are
published to the project; nothing else about that workspace is.

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `id`     | path  | yes      | Project ID                         |
| `kind`   | query | no       | `workflow` or `script`             |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

Each item:

```json
{
  "id": "wf_...",
  "name": "Provision account",
  "kind": "workflow",
  "version": 7,
  "sharedAt": "2026-10-29T10:00:00.000Z",
  "sharedBy": { "id": "usr_...", "name": "Lena Vogel" },
  "from": { "id": "ws_...", "slug": "it", "name": "IT", "colour": "blue" },
  "usedBy": [],
  "canOpen": false,
  "unshare": { "allowed": false, "reason": "Only people in IT can unshare it" }
}
```

`version` is the deployed version (null for a draft). `canOpen` is whether
the caller can open `from` (and so the item). `unshare` is whether they may
unshare it with `PUT /workflows/:id/share`: they need `share` in `from`.
`usedBy` (the workspaces that call it) stays empty until the Call Workflow
step records its callers; until then nothing blocks unsharing.

### `POST /projects/:id/move`

Session only. Move the project to another organization the caller also runs
(owner or admin of both: `403` otherwise), as one unit. Its workspaces,
workflows, keys and variables (its own and its workspaces') go with it. People who are not in the target
organization lose their rows in it; the rest keep theirs; open invitations
lose their places in it. Moving a project to the organization it is in
answers `400`; a slug another project in the target already uses answers
`409` and moves nothing; so does a locked project ("Turn off the deletion lock
first") — a move takes it out of the organization. A workspace's own lock
does not hold the project.

```json
{ "organizationId": "org_..." }
```

---

## Workspaces

A workspace is a room inside a project: workflows and functions live in
exactly one. Workspace routes take a project key or a session; an
organization-level key answers `403`.

**Who sees a workspace.** Org owners and admins and the project's admins and
members open every workspace in the project; anyone else opens only the
workspaces they hold a role in. A workspace the caller may not open is `404`
on every route, and never appears in a list or a count: nothing says it
exists.

**Roles.** In a workspace the caller is an `admin`, an `editor` or a
`viewer`: org owners/admins and project admins are admins everywhere, a
project member is an editor everywhere (a workspace grant can raise that to
admin), and a workspace grant alone gives its own role. A viewer reads and
runs; building, deploying and sharing need an editor; managing the
workspace, its members, keys and variables needs an admin. Every refusal is
`403` with the same reason the dashboard shows on the disabled action. A key
acts with the standing of whoever minted it (its creator's roles in the
project and workspace), needs the matching scope as well, and stops working
(`401`) once its creator can no longer open the project.

### `GET /workspaces`

The project's workspaces the caller can open, oldest first, each with
`counts` (workflows, deployed, functions, `sharedOut` — shared to the
project, runs in the last 24 hours, failing, last run), `createdBy`, `lock`, `inheritedLock`, `members` (sessions only; a
key gets an empty list), `viewerRole` and `viewerCan`. Each member carries
their effective `role`, `inherited` (it comes from the project or org, not a
grant here), `projectRole` (what the project alone gives), `orgRole` for
owners and admins, and `lastActiveAt`.

**Permission:** `workspaces:read`

| Param       | In    | Required | Description                    |
| ----------- | ----- | -------- | ------------------------------ |
| `projectId` | query | session  | or the `org` + `project` slugs |

### `POST /workspaces`

Create a workspace (project admins). `slug` defaults to the name, slugified;
`colour` is one of `green`, `blue`, `amber`, `purple`, `rose`. `members`
("who can get in") gives people already in the organization a role here,
written with the workspace as one unit; someone outside the organization
answers `409` and nothing is written; a row that counts no higher than what
the project already gives the person is skipped. A key creates the
workspace but not its roster (`members` from a key → `403`). A slug another
workspace in the project uses answers `409`; a reserved one (`workspaces`,
`shared`, `members`, `connections`, `api-keys`, `variables`, `settings`: the project's own
pages) `422`.

**Permission:** `workspaces:write`

```json
{
  "name": "Sales",
  "slug": "sales",
  "description": "",
  "colour": "blue",
  "members": [{ "userId": "usr_...", "role": "editor" }]
}
```

### `GET /workspaces/:id`

One workspace, as stored.

**Permission:** `workspaces:read`

### `PATCH /workspaces/:id`

Rename, re-slug, describe or recolour (workspace admins). A slug a sibling
uses answers `409`.

**Permission:** `workspaces:write`

```json
{
  "name": "Sales",
  "slug": "sales",
  "description": null,
  "colour": "amber"
}
```

### `DELETE /workspaces/:id`

Delete the workspace with the workflows in it (workspace admins). Deployed
Workers keep running on Cloudflare. Refused with `409` and nothing deleted
when the workspace is locked ("Turn off the deletion lock first"), its
project is locked ("Locked by Project 101"), or it is the project's last
workspace.

**Permission:** `workspaces:delete`

### `PUT /workspaces/:id/lock`

Session only (an API key answers `403`). Turns the workspace's own deletion
lock on or off (its admins and editors; a viewer answers `403`). While the
project is locked its lock covers every workspace in it and this answers
`409` "Locked by Project 101", on and off. Same body and response as
`PUT /projects/:id/lock`.

### `GET /workspaces/:id/shared`

What the project's **other** workspaces shared ("Shared with Sales"),
newest share first; the workspace's own shared items are not listed. Same
items, query and pagination as `GET /projects/:id/shared`, except `unshare`
is always `{ "allowed": false, "reason": "Unshare it from its own workspace" }`:
the list is read-only here. A workspace key gets `canOpen: false` on every
row: it opens only its own workspace, which this list leaves out. Project
and workspace keys with `workflows:read` read this metadata of other
workspaces' items by design: it is what the project publishes.

**Permission:** `workflows:read`

### `POST /workspaces/:id/move-workflows`

Move workflows from this workspace to another one in the same project
(workspace admins). A target that is not this project's, or that the caller
cannot open, answers `404`; one the caller cannot build in (a Viewer there)
answers `403`; workflow ids that are not in this workspace move nothing, and
`moved` lists the ids that did.

**Permission:** `workspaces:write`

```json
{
  "workflowIds": ["wf_..."],
  "targetWorkspaceId": "ws_..."
}
```

Response: `{ "moved": ["wf_..."] }`

### `GET /scope`

Session only. What the dashboard URL `/{org}/{project}/{workspace}` names:
`{ found: true, org, project?, workspace? }`, each level with its record,
the caller's role there and `viewerCan`; or `{ found: false, notFound: {
kind, slug, parent } }` naming the first level that did not match. A slug the
caller may not open reads as not found. The workspace record also carries
`runsByHour`: its runs in each of the 24 hours up to now, oldest first, as
`{ runs, complete, failed }`.

| Param       | In    | Required | Description                      |
| ----------- | ----- | -------- | -------------------------------- |
| `org`       | query | yes      | Organization slug                |
| `project`   | query | no       | Project slug                     |
| `workspace` | query | no       | Workspace slug (needs `project`) |

### `GET /orgs`

Session only. The organizations the session is a member of, with the
caller's `role`, `projectCount`, `memberCount` and `viewerCan`, plus what
`/dashboard`'s org cards show:

- `grants`: the caller's own roles there, oldest first —
  `projects: [{ name, role }]` (project-wide) and
  `workspaces: [{ name, projectName, role }]` (single workspaces). Empty for
  owners and admins, whose role covers everything.
- `health`: `{ failing, lastRunAt }` over the workflows in workspaces the
  caller can open — workflows whose latest run failed, and the last run's
  time (`null` with no runs).

### `PUT /orgs/:orgId/logo` · `DELETE /orgs/:orgId/logo`

Session only. Sets or clears the organization's logo; the organization's
owners and admins only (`403` with the reason otherwise, `404` for an
organization the caller is not in). Recorded as `organization.update`.

`PUT` takes the image itself as the body — `Content-Type: image/png` (or
`image/jpeg`, `image/webp`, `image/gif`), no JSON or base64 around it:

```bash
curl -X PUT "$API/api/orgs/$ORG_ID/logo" -H 'Content-Type: image/png' \
  --data-binary @logo.png -b "$COOKIE"
```

```json
{ "logo": "/api/images/img_3f9c…" }
```

The bytes decide: the file signature must be PNG, JPEG, WebP or GIF and
match the `Content-Type`, at most 200 KB and 4096 px on a side. Anything else
— an SVG, HTML, a body whose signature isn't the type it was sent as, an
empty body — is `400` with `{ "error", "field": "logo" }`, and nothing is
stored. A body over 200 KB is `413` before it is read. An SVG logo is drawn
to a PNG by the dashboard before it is sent. The previous logo's path
answers `404` from then on. `409` means another upload or removal of the
same logo landed first; nothing changed, so send it again. `DELETE` answers
`{ "logo": null }`.

### `GET /images/:id`

No session. An uploaded photo or logo, at the path its owner's `image` or
`logo` holds. The id is 128 random bits, new for every upload. Served with
the type detected at upload, `X-Content-Type-Options: nosniff`,
`Cache-Control: public, max-age=31536000, immutable`,
`Content-Security-Policy: default-src 'none'; sandbox` and
`Cross-Origin-Resource-Policy: same-site`. An image that was replaced or
cleared, or whose owner was deleted, is `404`.

### `GET /failing`

Session only. Workflows and functions whose latest run failed, across the
organization's workspaces the caller can open (`?org=` or
`?organizationId=`), most recent failure first, with the run and where each
lives.

---

## Members and access

Who can work where, below the organization. Every answer here names people,
so the writes are session only; the two lists are open to a key holding
`members:read` at its own level. Org owners and admins run the access editor
and remove people; a project's admins add people to it, and a workspace's
admins manage its own grants — both may invite new addresses into their own
place only, as org Members. A grant at or
below what the project already gives someone is refused (`409`), since it
would do nothing now and quietly keep them in later.

### `GET /members`

**Permission:** `members:read` — an organization key reads the organization's people (`?org=`), a project key its project's; a workspace key holds no `members` cell.

With `?org=`: everyone in the organization, each with `role`, `joinedAt` and
`places` (where a plain member can work: a project-wide role, or a role in
one workspace, in projects the caller can open — naming and counting only
the workspaces the caller can open, and never a workspace in a project the
person holds project-wide; empty for owners and admins).
With `&project=<slug>`: the project's members in two groups, `wholeProject`
(owners, org admins, project admins and members, with how they reach every
workspace) and `workspacesOnly` (people with grants in workspaces the caller
can open, with those workspaces and roles).

### `GET /members/:userId/access`

The access editor's data (org owners and admins): the person, `orgRole`,
every project in the organization with its workspaces, and their
`projectRoles` and `workspaceRoles` keyed by id.

### `PUT /members/:userId/access`

Save the editor: the org role and every project and workspace row of theirs
in the organization, replaced as one unit. Owners alone make or change
owners (`403`); the organization always keeps one owner (`409`, and then
nothing changes); an id outside the organization answers `404` and writes
nothing. A project or workspace named twice counts once, its last role
winning; a workspace row that counts no higher than what the project gives
the person is skipped. An org-wide role (`owner`, `admin`) drops the rows.

```json
{
  "orgRole": "member",
  "projects": [{ "projectId": "proj_...", "role": "member" }],
  "workspaces": [{ "workspaceId": "ws_...", "role": "admin" }]
}
```

### `DELETE /members/:userId`

Remove from the organization, with every row of theirs in it. Owners alone
remove an owner (`403`); the only owner cannot be removed (`409`).

### `GET /workspaces/:id/members`

Everyone who can open the workspace, with their effective `role`,
`inherited`, `projectRole`, `orgRole` and `lastActiveAt`.

**Permission:** `members:read` (project keys; a workspace key holds no `members` cell, an organization key no workspace)

### `POST /workspaces/:id/members`

Give someone in the organization a role here (`admin`, `editor` or
`viewer`). `409` with the reason when they are not in the organization, are
already in, or the role is at or below what the project gives them.

```json
{ "userId": "usr_...", "role": "editor" }
```

### `PATCH /workspaces/:id/members/:userId`

Change their grant's role; `409` when the new role would not count.

### `DELETE /workspaces/:id/members/:userId`

Remove their grant here. What the project gives them stays.

### `POST /workspaces/:id/invitations`

The workspace's admins invite people new to the organization (21b): one
invitation per address (up to twenty), each emailed, joining as an org
`member` with this workspace alone, at `role`. The same checks and limits as
`POST /invitations`: `409` naming an address already in the organization,
`422` for a malformed one, `429` past the email budget. An address the
organization has already invited answers `409` for an org owner or admin; for
anyone else (who can't see the org's invitations) it is skipped as if sent —
no second invitation, no email — so the answer never tells them who was
invited. The email budget counts every address sent either way. The
`invitation.create` audit row sits at this workspace. `201` with
`{ data: [{ id, email, expiresAt }] }` (the invitations created) for an org
owner or admin; anyone else gets `{ data: [{ email }] }`, one per address
sent, the same whether it was new or already invited.

```json
{ "emails": ["sam@newco.test"], "role": "editor" }
```

### `POST /projects/:id/members`

The project's admins (and org owners and admins) add someone already in the
organization (21a), either to the whole project or with one role in some of
its workspaces. One statement. Naming a workspace that isn't this project's
answers `404` and writes nothing; a workspace where they already hold a grant,
or where the project already gives them that much, is skipped. `201` with
what was written: `{ userId, scope: "project", role }` or
`{ userId, scope: "workspaces", role, workspaces: [{ id, name }] }`. `409`
with the reason when nothing was: not in the organization, an org owner or
admin (who reach every project), already in the project, already working in
some of its workspaces (the whole project is refused then: change their
access from the access editor), or the role would not count in any of the
workspaces named.

```json
{ "userId": "usr_...", "access": { "scope": "project", "role": "member" } }
```

```json
{
  "userId": "usr_...",
  "access": { "scope": "workspaces", "workspaceIds": ["ws_..."], "role": "editor" }
}
```

### `POST /projects/:id/invitations`

The project's admins invite people new to the organization (21a), as org
`member`s with the same `access` as `POST /projects/:id/members` — the whole
project, or the workspaces named, which must all be this project's (`404`
otherwise). Otherwise as `POST /workspaces/:id/invitations`.

```json
{ "emails": ["sam@newco.test"], "access": { "scope": "project", "role": "member" } }
```

### `GET /workspaces/:id/access-request`

The caller's open "Ask for edit access" request in this workspace, or
`null`.

### `POST /workspaces/:id/access-requests`

A Viewer asks for edit access. Addressed to the workspace's first admin by
name (`201`), who is told in their Inbox and by email; asking again answers
the open request (`200`) and puts it back in the admin's Inbox if its row is
gone (emailed again only then); an editor has nothing to ask for (`400`); a
workspace nobody else runs answers `409`.

### `POST /access-requests/:id/approve` · `POST /access-requests/:id/decline`

Answer a request (anyone who may manage the workspace's members; a request
in a workspace the caller cannot open is not found, before its state is
told). Approving makes the asker an editor in the same unit — only while
they are still a Viewer there, so someone raised to Admin meanwhile keeps
it — or records `alreadyEditing` when they were raised meanwhile; `409` when
the request was already answered (including by another answer sent at the
same moment) or the asker has since lost the workspace. The asker is told in
their Inbox.

---

## Invitations

Invitations into an organization. Session only. The collection is addressed
by `?org=` and is for owners and admins; an invitation is addressed by its
id, which is the token in the emailed link, and answered by the session
whose email it names. An invitation expires 7 days after it is sent or
resent. better-auth's own member and invitation endpoints are closed: this
is the one path.

### `GET /invitations`

Owners and admins (`?org=`; an invitation's id is its link): open, unexpired
invitations, newest first, with `places`, `sentAt`, `expiresAt`, `invitedBy` and `askedForNewAt`.

### `POST /invitations`

Invite people: one invitation per address (up to twenty a request), each
emailed. `places` apply to `member` invites only: a project-wide place takes
a project role, a workspace place a workspace role, no place twice, and no
workspace place a project-wide place in the body already covers at that
level or above (`422` otherwise). An address already in the organization,
or already invited, answers `409` naming it. A person may send a hundred
invitation emails an hour, resends included (`429` past that). `201` with
`{ data: [{ id, email, expiresAt }] }`.

```json
{
  "emails": ["sam@example.com"],
  "role": "member",
  "places": [{ "projectId": "proj_...", "workspaceId": "ws_...", "role": "editor" }]
}
```

### `GET /invitations/:id`

The invite page's state for the session that opened it: `open`,
`declined`, `wrong-account` (another address is signed in, or the session's
address is not verified: the card without its place, the inviter's address
or any action), `expired` (with `askedForNew`), or `gone` (accepted,
cancelled or unknown).

### `POST /invitations/:id/accept`

Join the organization with the invite's role and places, as one unit;
answers where to land (`{ org, project?, workspace? }` slugs). `403` for
the wrong account, `410` once expired, `409` while declined. The inviter is
told in their Inbox.

### `POST /invitations/:id/decline` · `POST /invitations/:id/undo-decline`

Decline, and take it back while the invite has not expired. A decline is
in the inviter's Inbox until it is undone.

### `POST /invitations/:id/ask-again`

After it expired: ask the inviter for a new one, once. The inviter gets an
email and an Inbox row that waits on them until they resend or cancel the
invite; `asked` says whether this call was the first.

### `POST /invitations/:id/resend` · `DELETE /invitations/:id`

Owners and admins (`?org=`): a fresh week and the email again — once per
ten minutes per invitation (`429` sooner) — or cancel. Cancelling an open or
declined invitation makes its link stop working; one already accepted or
cancelled answers `409`, one not in the organization `404`. Someone removed
from the organization, or no longer an owner or admin of it, has the
invitations they sent cancelled.

### `GET /me/invitations`

The open invitations waiting for the session's address, for `/dashboard`'s
"Waiting for you" — none for a session whose address is not verified. Each
has `token`, `org` (`name`, `slug`, `logo`), `invitedBy` (a name), `orgRole`,
`expiresAt` and `place`: where it leads first, as the invite page names it
(`{ kind: 'workspace', name, projectName, role }` or
`{ kind: 'project', name, role }`; `null` for an owner or admin invite).

---

## Versions

### `GET /workflows/:workflowId/versions`

List all versions for a workflow.

**Permission:** `workflows:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `GET /workflows/:workflowId/versions/:versionId`

Get a specific version including its IR and generated code.

**Permission:** `workflows:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `versionId`  | path | yes      | Version ID  |

### `POST /workflows/:workflowId/versions`

Create a new version by submitting a workflow IR. The IR is validated and compiled to code.

**Permission:** `workflows:write`

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

**Permission:** `workflows:write`

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

**Permission:** `workflows:write`

| Param        | In   | Required | Description             |
| ------------ | ---- | -------- | ----------------------- |
| `workflowId` | path | yes      | Workflow ID             |
| `versionId`  | path | yes      | Version ID to revert to |

### `DELETE /workflows/:workflowId/versions/:versionId`

Delete a version. Cannot delete the active version, a deployed version, or a locked version.

**Permission:** `workflows:delete`

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

**Permission:** `workflows:read`

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

**Permission:** `workflows:read`

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

**Permission:** `workflows:read`

Returns `{ importPrefix: "#app/", generated: ["worker.*", "nodes/**", "wrangler.*"], rootConfigFiles, extensions, limits: { maxFiles, maxFileBytes, maxTotalBytes }, files: [{ path, hash, size, updatedAt }] }`.

### `GET /workflows/:workflowId/files/:path`

**Permission:** `workflows:read`

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

**Permission:** `workflows:write`

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

**Permission:** `workflows:read`

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

**Permission:** `workflows:write`

### `DELETE /workflows/:workflowId/files/:path`

Optional `If-Match` as above. Returns `204`; `404` when the file does not
exist; `409` when the precondition fails.
Deleting `handlers.ts` or `package.json` also clears the legacy setting it
stood in for (`triggerCode` / `dependencies`), so the file does not
reappear as a seed and the next deploy uses the default handlers / no
project dependencies.

**Permission:** `workflows:delete`

---

## Deployments

### `GET /deployments`

List all deployments across all workflows for the authenticated user.

**Permission:** `runs:read`

### `GET /workflows/:workflowId/deployments`

List deployments for a specific workflow.

**Permission:** `runs:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `GET /workflows/:workflowId/deploy-connections`

The accounts Deploy offers the workflow — its project's — and the one already
chosen: its workspace's own account, else the project default.

**Permission:** `workflows:read`

```json
{
  "connections": [
    {
      "id": "con_1",
      "provider": "cloudflare",
      "name": "Acme production",
      "accountSuffix": "7f2a",
      "scope": "shared",
      "tokenStatus": "active",
      "tokenExpiresAt": null
    }
  ],
  "defaultId": "con_1"
}
```

### `POST /workflows/:workflowId/deploy`

Deploy a workflow version to a connection. Validates environment variables and credentials before deploying.

**Permission:** `workflows:deploy`

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

**Permission:** `workflows:deploy`

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
`connectionId` must be a connection this workflow has a successful deployment
with; any other answers `404`
`{ "error": "This workflow isn’t deployed with that connection" }`.

**Permission:** `workflows:run`

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

**Permission:** `workflows:deploy`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

```json
{
  "connectionId": "connection-id"
}
```

As a trigger, the connection must be one the workflow has a successful
deployment with: any other answers `404`
`{ "error": "This workflow isn’t deployed with that connection" }`.

---

## Runs

### `GET /runs`

List all runs across all workflows for the authenticated user.

**Permission:** `runs:read`

With a workspace named (`?workspace=` or `?workspaceId=`), that workspace's
runs, newest first, each with `workflowName` and `kind`, plus `counts`
(`all`, `succeeded`, `failed`, `running`) over the period and search —
before `result` is applied, so the filter pills keep their numbers.

| Param    | In    | Required | Description                             |
| -------- | ----- | -------- | --------------------------------------- |
| `result` | query | no       | `succeeded`, `failed` or `running`      |
| `period` | query | no       | `24h`, `7d` or `30d`                    |
| `search` | query | no       | Matches the workflow name or the run id |

These three need a workspace: without one they answer `400`.

### `GET /workflows/:workflowId/runs`

List runs for a specific workflow.

**Permission:** `runs:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |

### `GET /workflows/:workflowId/runs/:runId`

Get a specific run. Run status is reconciled from the provider by a background sync loop (every 5 seconds on the Node server, every minute via cron on Workers), so reads are immediate and never block on provider round-trips.

**Permission:** `runs:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `GET /workflows/:workflowId/runs/:runId/steps`

Per-step telemetry for a run, collected by the background sync loop: each durable step's label, kind (`do` / `sleep` / `waitForEvent` / `rollback`), status, timing, attempt count, and last error. Steps are attributed to canvas nodes (`nodeId`) through the step manifest recorded at deploy time; generated step labels are derived from node ids, so attribution survives node renames. Loop iterations appear as separate entries (`stepIndex` is the 1-based occurrence per label). Coalesced steps (adjacent plain nodes merged into one billable step) report one record attributed to the group's leader node; the response's `coalescedInto` map (`memberNodeId → leaderNodeId`, read from the deploy manifest) links each member node to that leader, so UIs can show members as having run inside the leader's step. Response shape: `{ data: RunStep[], coalescedInto: Record<string, string> }`. Returns an empty list for runs synced before a manifest-bearing deploy existed or when no steps have been reported yet.

**Permission:** `runs:read`

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

**Permission:** `runs:read`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/pause`

Pause a running workflow instance.

**Permission:** `workflows:run`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/resume`

Resume a paused workflow instance.

**Permission:** `workflows:run`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

### `POST /workflows/:workflowId/runs/:runId/terminate`

Terminate a running or paused workflow instance.

**Permission:** `workflows:run`

| Param        | In   | Required | Description |
| ------------ | ---- | -------- | ----------- |
| `workflowId` | path | yes      | Workflow ID |
| `runId`      | path | yes      | Run ID      |

---

## Connections

A connection is a Cloudflare account the organization deploys to: its
credentials (encrypted at rest; secrets never returned), **which projects may
deploy with it**, and its **token's health** as Cloudflare last reported it.

- **Who may change them.** Create, update and delete need an organization
  **owner or admin** (`403` otherwise); a key acts with its creator's standing.
  Any member reads the list. Mutations are organization-level: a
  project-scoped API key answers `403`. Reads stay available to keys — a deploy
  needs its connection.
- **Projects.** A connection is available to every project (`allProjects: true`,
  the default and what connections made before B9 read as), or only to the
  projects on its list. Availability is what an org admin decides; a project
  then **adds** the accounts it deploys to, or connects its own (see
  [Project connections](#project-connections)). `POST /workflows/:workflowId/deploy`
  (and `/deploy-stream`, `GET /workflows/:workflowId/deploy-config/:connectionId`
  and the config preview) refuse an account that isn't one of the workflow's
  project's with `403`
  `{ "error": "That account isn’t one of this project’s. Add it on the project’s Connections page." }`.
  An account a project owns is never listed here: `GET /connections` shows the
  organization's accounts only, and `PATCH`/`DELETE /connections/:id` answer
  `404` for one (it's managed on the project's page).
  Taking a deployment down, triggering runs and pausing, resuming or
  terminating them are not held to the list — but a trigger must name a
  connection the workflow was deployed with.
- **Token checks.** Creating a connection, and replacing its token, ask
  Cloudflare first (`/user/tokens/verify`, then `/accounts`) through the same
  lockout as `verify-token` below. A token Cloudflare refuses is `400`
  `{ "error": "…", "field": "token" }`; one that can't reach the account named is
  `400` with `"field": "accountId"` (asked directly with `GET /accounts/:id`;
  skipped when Cloudflare doesn't answer); account-owned tokens, which
  `/user/tokens/verify` refuses, are verified at `/accounts/:id/tokens/verify`;
  Cloudflare unreachable is `502` and stores nothing. The token's expiry
  (`expires_on`) is stored with the check. Once a day each Cloudflare
  connection's token is checked again (at most 20 per hourly tick, oldest first,
  organizations taking turns):
  a token revoked or rolled in Cloudflare reads `invalid`; an outage changes
  nothing.
- **Inbox.** Whoever can replace a token — the connection's creator and the
  organization's owners and admins — get `connection.token_expiring` a week and
  a day before it expires, and `connection.token_invalid` when a check finds it
  dead (see [Notifications](#notifications)). Replacing the token or deleting the
  connection takes those rows back.

### `GET /connections`

List the organization's connections, newest first.

**Permission:** `connections:read` (project and workspace keys: `workflows:read`)

| Param       | In    | Required | Description                                     |
| ----------- | ----- | -------- | ----------------------------------------------- |
| `cursor`    | query | no       | Pagination cursor                               |
| `limit`     | query | no       | Items per page (1–100, default 50)              |
| `projectId` | query | no       | Only connections serving this project (by id)   |
| `project`   | query | no       | Only connections serving this project (by slug) |

A project that isn't the organization's (or a slug nobody uses) lists nothing.

```json
{
  "data": [
    {
      "id": "conn_1",
      "organizationId": "org_1",
      "provider": "cloudflare",
      "name": "Acme production",
      "credentials": { "accountId": "0123…7f2a", "apiToken": "***" },
      "createdBy": "usr_1",
      "createdByName": "Ama Mensah",
      "accountSuffix": "7f2a",
      "allProjects": false,
      "projects": [{ "id": "prj_1", "name": "Project 101", "slug": "project-101" }],
      "hiddenProjects": 1,
      "tokenStatus": "active",
      "tokenExpiresAt": "2026-12-01T00:00:00.000Z",
      "tokenCheckedAt": "2026-10-31T09:00:00.000Z",
      "deployments": { "count": 18, "lastAt": "2026-10-30T11:00:00.000Z" },
      "createdAt": "2026-10-01T00:00:00.000Z",
      "updatedAt": "2026-10-31T09:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

- `projects` names only the projects the reader can open — a person's, or an
  organization key's creator's as they stand now; a project or workspace key:
  its own project. `hiddenProjects` counts the rest. Empty when `allProjects`.
  The `projectId`/`project` filter likewise matches only a project the reader
  can open.
- `tokenStatus`: `active`, `invalid`, or `unchecked` (never checked yet: made
  before B9; filled in within a day). `tokenExpiresAt` is null for a token
  without expiry, or one not checked yet.
- `deployments` counts successful deployments made with it.

### `POST /connections`

Check the token with Cloudflare, then create the connection. Answers `201` with
the row as the list shows it.

**Permission:** `connections:write` — organization owners and admins

```json
{
  "provider": "cloudflare",
  "credentials": { "apiToken": "...", "accountId": "..." },
  "name": "My Connection",
  "allProjects": false,
  "projectIds": ["prj_1"]
}
```

`projectIds` alone narrows the connection to those projects; leave both out
for every project. A project id that isn't the organization's is `400`
`{ "field": "projects" }`. `provider` must be one this instance has
(`cloudflare`); `credentials.accountId` must be 32 hex digits (`400`
`{ "field": "accountId" }` otherwise, before Cloudflare is asked). Limited to
10 per minute per person, as `verify-token`.

### `POST /connections/verify-token`

Ask Cloudflare whether a token works and which accounts it reaches, before
saving. Currently supports the `cloudflare` provider.

**Permission:** `connections:read` (project and workspace keys: `workflows:read`)

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
  "accounts": [{ "id": "abc123", "name": "My Account" }],
  "expiresAt": "2026-12-01T00:00:00.000Z"
}
```

A refused token is `{ "valid": false, "accounts": [], "expiresAt": null }`;
Cloudflare unreachable is `502`. `accounts` lists the first 50. An
`accountId` in `credentials` is only used to verify an account-owned token at
that account; it never refuses the check.

**Lockout.** Checks that didn't pass are counted per person over the last
hour — `verify-token`, `POST /connections` and token replacements alike;
checks still in flight count too. A valid token withdraws only its own check:
it never clears the count. A key's checks count against every key its creator
minted, but never against the creator's own dashboard checks. Three are free;
the fourth starts a 30-second wait, and each further failure doubles it, up to
5 minutes, counted from the last failure. Inside the wait the check answers
`429` with a `Retry-After` header (seconds) and
`{ "error": "Too many failed token checks. Try again in 20 s." }`, and nothing
reaches Cloudflare. Each failure, and each wait it starts, is an audit-log event
(`connection.verify.failed`, `connection.verify.locked`).

### `PATCH /connections/:id`

Rename a connection, replace its token, or change its projects. Answers the
row as the list shows it.

**Permission:** `connections:write` — organization owners and admins

| Param | In   | Required | Description   |
| ----- | ---- | -------- | ------------- |
| `id`  | path | yes      | Connection ID |

```json
{
  "name": "Updated Name",
  "credentials": { "apiToken": "new-token" },
  "allProjects": false,
  "projectIds": ["prj_1", "prj_2"]
}
```

`credentials` is **merged** into what is stored: `{ "apiToken" }` alone keeps
the account. New credentials are checked with Cloudflare first (as on create);
a refused token leaves the stored one untouched. A new project list replaces
the old one; `{ "allProjects": true }` clears it. Limited to 10 per minute per
person (it may ask Cloudflare). Audited as
`connection.update` ("Renamed from …", "Credentials changed", "Projects changed").

### `DELETE /connections/:id`

Delete a connection. Deployments and runs made with it keep their history.

**Permission:** `connections:delete` — organization owners and admins

| Param | In   | Required | Description   |
| ----- | ---- | -------- | ------------- |
| `id`  | path | yes      | Connection ID |

## Project connections

The Cloudflare accounts a project deploys to: organization accounts it has
**added**, and accounts it **owns** ("This project only" — never listed for the
organization or usable by another project). One of them is the project's
**default**; a workspace deploys to the default unless an account is **set for
that workspace**. Deploy offers only these accounts.

- **Who.** Anyone who can open the project reads them. Adding, connecting,
  removing and choosing defaults need a **project admin** or an organization
  owner or admin (`403` `{ "error": "Only project admins and org owners can do this" }`).
  An account connected from a project is always its own; accounts for the whole
  organization are connected with `POST /connections` by its owners and admins. Project keys are refused under `/projects/:id`
  (`403`); an organization key uses its `connections` cells.
- **Defaults.** The first account a project gets becomes its default; removing
  the default leaves none, unless one account is left, which becomes it. A
  project with no default can still deploy by naming an account.
- **Existing projects.** The 2026-11 migration added every account that served
  each project, and made its default the account of its latest successful
  deploy (else its only account).
- **A project that moves** to another organization takes its own accounts; the
  old organization's shared accounts stay behind. Deleting a project deletes
  its own accounts.
- Audited as `project_connection.add`, `.create`, `.update`, `.remove`,
  `.default` and `workspace_connection.set`.

### `GET /projects/:id/connections`

The project's accounts and where each workspace deploys.

**Permission:** `connections:read`

```json
{
  "connections": [
    {
      "id": "con_1",
      "provider": "cloudflare",
      "name": "Acme production",
      "accountSuffix": "7f2a",
      "createdByName": "Ama Mensah",
      "scope": "shared",
      "tokenStatus": "active",
      "tokenExpiresAt": null,
      "isDefault": true,
      "available": true,
      "deployments": { "count": 18, "lastAt": "2026-11-01T10:00:00.000Z" },
      "deployedFrom": ["Support"],
      "addedAt": "2026-11-01T09:00:00.000Z"
    }
  ],
  "workspaces": [
    {
      "workspaceId": "ws_1",
      "name": "Sales",
      "connectionId": "con_1",
      "connectionName": "Acme production",
      "source": "default",
      "lastDeployAt": null
    }
  ]
}
```

`scope` is `shared` (an organization account) or `project` (owned).
`available: false` marks a shared account an org admin has since restricted to
other projects: it stays listed but Deploy refuses it. `source` is `override`
(set for the workspace), `default` or `none`. Workspaces are those the reader
can open.

### `GET /projects/:id/connections/available`

The organization's accounts as _Add connection_ lists them: `state` is
`added`, `available` or `restricted` (not available to this project);
`restrictedTo` names the projects a restricted one serves that the reader can
see.

**Permission:** `connections:read`

### `POST /projects/:id/connections`

Add organization accounts to the project. Only accounts available to it are
added; ones already added are skipped. `400` when none could be added.

**Permission:** `connections:write` — project admins

```json
{ "connectionIds": ["con_1", "con_2"] }
```

Answers `201` `{ "added": [{ "id", "name" }], "defaultId": "con_1" | null }`
(`defaultId` when the first one became the default).

### `POST /projects/:id/connections/new`

Connect a new Cloudflare account from the project. The token is checked with
Cloudflare first, as on `POST /connections` (same `400`/`502` answers, same
10-per-minute limit).

**Permission:** `connections:write` — project admins

```json
{
  "name": "Checkout staging",
  "accountId": "0123456789abcdef0123456789abcdef",
  "token": "…",
  "makeDefault": true
}
```

The account is always the project's own ("This project only"): an account for
the whole organization is connected with `POST /connections`. Any other field
(such as an old `share`) answers `422`. `makeDefault` (default `true`) makes it
the project's default. Answers `201` `{ "id", "name", "scope": "project", "isDefault" }`.

### `PATCH /projects/:id/connections/:connectionId`

Replace the token of an account the project owns (`{ "token", "accountId"? }`),
checked with Cloudflare first. A shared account answers `404` — it's changed on
the organization's page.

**Permission:** `connections:write` — project admins

### `DELETE /projects/:id/connections/:connectionId`

Take an account off the project: an added one leaves the project, an owned one
is **deleted**. Workspaces set to it follow the project default again.
Deployed workflows keep running on what they went out with. An owned account a
workflow is still deployed with is kept: `409` naming the workflow (workflows in
other projects are only counted) until they're taken down.

**Permission:** `connections:delete` — project admins

Answers `{ "ok": true, "name", "owned", "wasDefault", "workspacesCleared" }`.

### `PUT /projects/:id/default-connection`

`{ "connectionId": "con_1" }` — make one of the project's accounts its
default. `400` when it isn't one of them.

**Permission:** `connections:write` — project admins

### `PUT /projects/:id/workspaces/:workspaceId/connection`

`{ "connectionId": "con_1" }` sets the workspace's own account;
`{ "connectionId": null }` puts it back on the project default. `404` for a
workspace of another project, `400` for an account that isn't the project's.

**Permission:** `connections:write` — project admins

---

## Environment Variables

A variable is set at one of three **levels** — the organization, a project, or
one workspace — and a workflow's `{{global.env.NAME}}` references resolve
against its own workspace, then its project, then the organization: the
closest level wins. Every call is **addressed at a level** in the query, as
`/api-keys`: `?org=` the organization's own variables, `&project=` (or
`?projectId=`) a project's own, `&workspace=` (or `&workspaceId=`) a
workspace's own. For a key, its pin is its address: a project key's calls land
at its project (`&workspace=` names one of its workspaces), a workspace key's
at its workspace. A body naming a project or workspace is `400`.

**Who may.** Anyone who can open the level reads its variables. Setting,
editing and deleting them is for whoever manages the level — org owners and
admins at the organization, project admins at a project, that workspace's
admins at a workspace — and a refusal is `403` with the dashboard's reason
("Only project admins and org owners can do this", "Only this workspace's
admins can do this"). A level the caller cannot open is `404`. A key acts with
its creator's standing here as everywhere. Masking hides a value from readers,
not from workflows: anyone who may deploy or run a workflow in a workspace
(an Editor) uses every secret that workspace resolves, and a workspace's
admins may override a project's or the organization's value for their
workspace alone.

**One name per level.** A name already set at the addressed level answers
`409` (`"NAME is already set here. Edit it instead"`, with `details[0].path:
"name"`); the same name at another level is another variable. Names match
`^[A-Z][A-Z0-9_]*$`. Secret values are masked as `••••••••` in every read.

**Where a project's or organization's variable applies (`reach`).** A project's
variable reaches every workspace of the project, an organization's every
project of the organization — unless it was set for a list. A body `reach` is
`{ "all": true }` or `{ "ids": [...] }` (workspace ids at a project,
project ids at the organization; 1–50 ids, else `422`); at a workspace it is
`400`. A place that sets its own value of the same name is never reached and
is skipped (named in `skipped`). An id that is not one of the level's own
places is `404`, and nothing is written. Reach only grows: a list can be added
to, or widened to `all`, never narrowed (`422`, and nothing in the request —
not the value either — is saved). A list is saved together with the variable or
not at all.

`reach` limits where a value is **delivered** (deploys, runs, the workspace's
resolved list), not who can read it: anyone who can open the project still reads
a non-secret project variable from the project's own list, whichever workspaces
it reaches. Secrets stay masked.

### `GET /env-vars`

The addressed level's own rows, newest first, paginated. An organization's
rows carry `overriddenIn`: how many projects the caller can open set the same
name themselves, in the project or one of its workspaces, and `reach`:
`{ all, places: [{ id, slug, name }], blocked: [ids] }` — the projects it is
listed for (when `all` is false) and the projects that set their own value.

**Permission:** `resources:read` (organization keys) · `variables:read` (project and workspace keys)

```json
{
  "data": [
    {
      "id": "env_...",
      "level": "organization",
      "organizationId": "org_...",
      "projectId": null,
      "workspaceId": null,
      "name": "REGION",
      "value": "eu",
      "isSecret": false,
      "overriddenIn": 1,
      "reach": { "all": true, "places": [], "blocked": [] },
      "createdBy": "usr_...",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "nextCursor": null
}
```

### `GET /env-vars/resolved`

The level's resolved view, not paginated. Addressed at a **project**
(`&project=`): each name once, the project's own value over the org's, with
`setAt` (`{ level, id, name }`) and `overriddenIn` — the workspaces the caller
can open that set their own value, as `{ id, slug, name, colour }` chips; the
project's own rows first, then the org's, by name. The project's own rows
carry `reach` (`{ all, places, blocked }` over its workspaces; `null` on an
inherited organization row), and an organization row the project is not
listed for is not shown. Addressed at a
**workspace** (`&workspace=`): each name once, the closest level winning, with
`source` (`{ level, id, name }`) and `overrides` (`"project"`,
`"organization"` or `null`); the workspace's rows first, then the project's,
then the org's. Addressed at the organization alone: `400`.

**Permission:** `resources:read` (organization keys — which can address no project: `400` with no address, `403` naming one) · `variables:read` (project and workspace keys)

### `POST /env-vars`

Set a variable at the addressed level.

**Permission:** `resources:write` (organization keys) · `variables:write` (project and workspace keys)

```json
{
  "name": "MY_VAR",
  "value": "my-value",
  "isSecret": false,
  "reach": { "ids": ["ws_..."] }
}
```

`reach` is optional (default: every place). Answers `201` with the row, its
`level` and `skipped` — the listed ids it does not reach because they set
their own value; `409` when the name is already
set at that level, or when every listed place was skipped (nothing is saved,
`skipped` names them); `404` when the level cannot be opened.

### `PATCH /env-vars/:id`

Update a variable's name, value, or secret flag. The row must sit at the
addressed level: an org-wide row addressed at a project, or a workspace's row
addressed at its project, is `404`. Making a secret variable non-secret
requires a new `value` in the same request — a stored secret never becomes
readable — otherwise the request answers `422` (`details[0].path: "value"`).
A rename into a name already set at the level is `409`. A `reach` widens where
it applies (see above) and the answer carries `skipped`; it is `422` when it
would narrow a variable that applies everywhere. The new value applies to every
place the variable reaches, in this one request.

**Permission:** `resources:write` (organization keys) · `variables:write` (project and workspace keys)

| Param | In   | Required | Description             |
| ----- | ---- | -------- | ----------------------- |
| `id`  | path | yes      | Environment variable ID |

```json
{
  "value": "new-value",
  "reach": { "ids": ["ws_..."] }
}
```

### `DELETE /env-vars/:id`

Delete a variable at the addressed level (`404` when it is not there).

**Permission:** `resources:delete` (organization keys) · `variables:delete` (project and workspace keys)

| Param | In   | Required | Description             |
| ----- | ---- | -------- | ----------------------- |
| `id`  | path | yes      | Environment variable ID |

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

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

### `GET /nodes/templates`

Get node template resolver data.

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

### `GET /nodes/:nodeId`

Get a single node definition.

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

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

**Permission:** `workflows:write`

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

**Permission:** `workflows:read`

### `POST /test-sessions/:sessionId/trigger`

Invokes the session's `fetch` handler, the way a deployed worker would be
invoked. Body: `{ "payload": { ... } }`, under 100 KB. Returns the worker's
own `{ status, body }`.

**Permission:** `workflows:run`

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

**Permission:** `workflows:read`

| Param        | In    | Required | Description                       |
| ------------ | ----- | -------- | --------------------------------- |
| `sessionId`  | path  | yes      | Session ID                        |
| `after`      | query | no       | Cursor from the last `logs` event |
| `instanceId` | query | no       | Also stream this run's status     |

### `DELETE /test-sessions/:sessionId`

Stops the worker and closes the session. Stopping one that has already
stopped is not an error — the container may still exist even when the record
says otherwise.

**Permission:** `workflows:run`

## Marketplace

Installing, uninstalling and updating nodes are organization-level actions: a
project-scoped API key answers `403`.

### `GET /marketplace`

Get the full marketplace catalog with installation status for the current organization.

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

Each entry is the registry's (`id`, `name`, `description`, `category`, `tags`,
`author`, `latest`, `versions`, …) plus `installed`, `installedVersion` and
`usage`: how many of the organization's workflows use the node in their
current version (`null` when not installed; drafts saved after the current
version don't count), and `inRegistry`. A node still installed that the registry
no longer lists comes last with `inRegistry: false`, its name, category and
description from its installed bundle, and `latest` = its installed version, so
it can still be uninstalled. `503` when the instance has no node registry
configured.

### `GET /marketplace/:nodeId`

Get details for a specific marketplace node, including available versions and installation status.

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

| Param    | In   | Required | Description                                  |
| -------- | ---- | -------- | -------------------------------------------- |
| `nodeId` | path | yes      | Node ID (alphanumeric, hyphens, underscores) |

### `GET /marketplace/installed`

List installed marketplace nodes for the current organization.

**Permission:** `resources:read` (project and workspace keys: `workflows:read`)

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

### `POST /marketplace/install`

Install a node from the marketplace.

**Permission:** `resources:write`

```json
{
  "nodeId": "stripe",
  "version": "1.0.0"
}
```

`version` is optional — defaults to the latest available version.

### `POST /marketplace/uninstall`

Uninstall a previously installed node.

**Permission:** `resources:delete`

```json
{
  "nodeId": "stripe"
}
```

### `POST /marketplace/update`

Update an installed node to a newer version.

**Permission:** `resources:write`

```json
{
  "nodeId": "stripe",
  "version": "1.1.0"
}
```

`version` is optional — defaults to the latest available version.

---

## Audit log

Who changed what in an organization, newest first, kept for **90 days**.
Each sensitive operation writes one event after it succeeds (a refused or
failed request writes none, except the deletions the deletion lock blocked
and failed token checks). An event's words are written when it happens:
renaming or deleting what it names later does not change it. Variable
values, credentials and key secrets are never recorded. Deleting the
organization leaves its events to the 90-day purge.

### `GET /audit-events`

Organization-scoped (`?org=<slug>` or `?organizationId=<id>`). Org owners
and admins only (`403` for anyone else); an API key reads it as its
creator, who must still be one.

**Permission:** `audit:read` (organization keys only; project and workspace keys are refused for their level)

| Param    | In    | Required | Description                                                                                                                                   |
| -------- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`  | query | no       | `organization`, `project` or `workspace`                                                                                                      |
| `period` | query | no       | `24h`, `7d` (default), `30d` or `90d`                                                                                                         |
| `search` | query | no       | Up to 200 characters; matches the actor, action and target, ignoring case (ASCII letters only on SQLite and D1). `%` and `_` match themselves |
| `cursor` | query | no       | From the previous page's `nextCursor`                                                                                                         |
| `limit`  | query | no       | 1–100, default 50                                                                                                                             |

Response:

```json
{
  "data": [
    {
      "id": "Vn3…",
      "at": "2026-10-30T09:12:44.120Z",
      "kind": "danger",
      "event": "workspace.delete.blocked",
      "actor": "Tom Becker",
      "actorType": "user",
      "actorId": "usr_…",
      "actorEmail": "tom@acme.test",
      "action": "tried to delete the workspace",
      "target": "IT",
      "detail": "Blocked by the deletion lock · Dashboard · 81.2.69.x",
      "ip": "81.2.69.x",
      "scope": { "level": "project", "name": "Project 101" }
    }
  ],
  "nextCursor": null,
  "total": 1
}
```

`total` counts every event the filter matches, on every page. `actor` is a
person's name, or a key's name when `actorType` is `key` (its detail then
says which key: `Project API key ask_Kq3V…a71d`). Names are their owners' to
choose, so `actorId` (a user or key id) and `actorEmail` (a person's address
when they acted, null for a key) say who it was. Names and other chosen text
are kept without control or direction-override characters, at most 200
characters. `ip` is the caller's
address cut to its `/24` (IPv4, `81.2.69.x`) or `/48` (IPv6) — the full
address is never stored. `scope` names the place as it is now
(`"Deleted project"` once it is gone); `colour` is set for workspace events.

| Kind     | Events                                                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `danger` | `project.delete`, `project.delete.blocked`, `project.move.out`, `project.move.in` (a move is logged in both organizations), `project.move.blocked`, `workspace.delete`, `workspace.delete.blocked`, `workflow.delete`, `workflow.takedown`, `version.delete`, `account.delete` (in each organization the person was in, just before)          |
| `key`    | `api_key.create`, `api_key.revoke`, `connection.create`, `connection.update`, `connection.delete`, `variable.create`, `variable.update`, `variable.delete`                                                                                                                                                                                    |
| `access` | `member.join`, `organization.update`, `workflow.move`, `invitation.create`, `invitation.cancel`, `member.access`, `member.remove`, `project_member.add`, `workspace_member.add`, `workspace_member.role`, `workspace_member.remove`, `access_request.approve`, `access_request.decline`, `workflow.share`, `workflow.unshare`, `member.leave` |
| `deploy` | `workflow.deploy`, `version.revert`, `node.install`, `node.update`, `node.uninstall`                                                                                                                                                                                                                                                          |
| `lock`   | `project.lock`, `project.unlock`, `workspace.lock`, `workspace.unlock` (only when the lock actually changes)                                                                                                                                                                                                                                  |
| `auth`   | `signin`, `account.method_connect`, `account.method_disconnect`, `session.revoke`, `account.export` (each once in every organization the person belongs to), `connection.verify.failed`, `connection.verify.locked`                                                                                                                           |

Not recorded: creating or editing projects, workspaces and workflows, file
and graph edits, runs, test sessions, reads, and refused requests.

---

## Session-Only Endpoints

These endpoints require session authentication and are **not accessible via
API key**: keys never manage keys.

### `GET /api-keys`

The keys of one level, addressed by its slugs: `?org=` the organization's own keys (owners and admins only, `403` otherwise), `?org=&project=` the project's own keys with `workspaceCounts` (unrevoked keys per workspace the caller can open, expired ones included as the workspace's own list is), `?org=&project=&workspace=` the workspace's `own` keys and the `inherited` project keys that reach it (unrevoked and unexpired). A workspace named without its project is `400`. Revoked keys never return. Each key carries `level`, `permissions` (the grid), `keyPrefix` and `keySuffix` (the first eight and last four characters of the secret), `createdBy` and `createdByName`, `expiresAt`, `lastUsedAt`, and for workspace keys its `workspace`.

| Param    | In    | Required | Description                         |
| -------- | ----- | -------- | ----------------------------------- |
| `cursor` | query | no       | Pagination cursor (org and project) |
| `limit`  | query | no       | Items per page (1–100, default 50)  |

### `POST /api-keys`

Mint a key at the addressed level — `?org=` by an org owner or admin, `?org=&project=` by a project admin, `?org=&project=&workspace=` by a workspace admin (`403` with the reason otherwise). The body's `level` must be the addressed one (`400`); `permissions` is the grid, only cells the level offers (`422` naming any other), at least one (`422`); `expiresAt` is optional and must be in the future (`422`). The answer is the key as `GET` lists it — `level`, `permissions`, `keyPrefix` and `keySuffix`, `createdBy` and `createdByName`, and for a workspace key its `workspace` — plus the secret, once, as `key`; a project or workspace the caller cannot open answers `404`.

```json
{
  "name": "CI deploys",
  "level": "project",
  "permissions": { "workflows": ["read", "deploy", "run"], "runs": ["read"] },
  "expiresAt": "2026-12-31T00:00:00Z"
}
```

Keys never mint keys: this endpoint takes a session. Keys minted before this
by an organization key keep their `parentKeyId` and still stop working
(`401`) when that key is revoked or expires.

### `DELETE /api-keys/:id`

Revoke a key of the addressed level, by whoever manages it there (as for
`POST`); a key of another level at that address is `404`.

### Your account

The person's own rows, the same in every organization (B10): no `?org=`, and
no key reads or changes them (`403`).

#### `GET /account`

```json
{
  "person": {
    "id": "usr_…",
    "name": "Ama Mensah",
    "email": "ama@acme.test",
    "image": null,
    "emailVerified": true
  },
  "orgs": [
    {
      "id": "org_…",
      "slug": "acme",
      "name": "Acme Inc",
      "logo": null,
      "role": "owner",
      "projectCount": 3,
      "onlyOwner": true
    }
  ],
  "deleteBlockedReason": "You're the only owner of Acme Inc",
  "signInMethods": [
    {
      "provider": "github",
      "connected": true,
      "connectedAt": "2026-09-02T10:00:00.000Z",
      "accountId": "acc_…"
    },
    { "provider": "google", "connected": false, "connectedAt": null, "accountId": null },
    { "provider": "email", "connected": true, "connectedAt": null, "accountId": null }
  ],
  "providers": { "github": true, "google": true, "emailLink": true }
}
```

`projectCount` counts the projects the person can open. `onlyOwner` is true
where nobody else owns the organization; `deleteBlockedReason` names every
such organization. `signInMethods` lists the providers the instance turns on
(and any still linked after it turned one off), then the email link when the
instance sends magic links. `providers` is what the instance turns on.

#### `POST /account/orgs/:orgId/leave`

Leave an organization, with the person's project and workspace roles in it,
as one unit; recorded there as `member.leave`. The only owner gets `409`
("Make someone else an owner first"); an organization the person is not in
is `404`. better-auth's `/organization/leave` stays closed.

#### `PUT /account/photo` · `DELETE /account/photo`

Sets or clears the person's photo. `PUT` takes the image itself as the body,
as for an organization logo (`PUT /orgs/:orgId/logo`), and answers
`{ "image": "/api/images/img_…" }`: PNG, JPEG, WebP or GIF by its signature,
at most 512 KB and 4096 px on a side (the dashboard shrinks a pick of up to
2 MB to 256 px first). A refusal is `400` with `"field": "image"`; over
512 KB is `413`. `DELETE` answers `{ "image": null }`.

#### `GET /account/sessions`

The person's unexpired sessions, the one making the call first, then by last
activity. Sessions are named by id — never by their token:

```json
{
  "data": [
    {
      "id": "ses_…",
      "device": "Chrome on macOS",
      "kind": "desktop",
      "ip": "81.2.69.x",
      "signedInAt": "…",
      "activeAt": "…",
      "current": true
    }
  ]
}
```

`kind` is `desktop`, `phone` or `terminal` (curl, scripts); `ip` is masked
as in the audit log, `null` when none was known.

#### `DELETE /account/sessions/:id` · `DELETE /account/sessions?scope=others`

Sign out one other session, or every other one (`{ "count": 2 }`); each is
recorded as `session.revoke`. The session making the call is `400` (sign out
instead); someone else's id is `404`; `DELETE /account/sessions` without
`scope=others` is `400`.

#### `POST /account/export`

Download JSON: the person's own rows — `profile` (`name`, `email`, `photo`
as a boolean), `signInMethods`, `sessions`, and `memberships` with each
organization's `role`, project roles (`projects`) and workspace roles
(`workspaces`). Nothing the organizations own (workflows, runs, connections,
other people). Recorded as `account.export`; 10 an hour. A `POST` so that a
cross-site link can't write audit rows (the CSRF check covers it).

#### Through better-auth (`/api/auth/*`)

- **Name**: `POST /api/auth/update-user` with `name`. Its `image` only
  clears the photo (`null`); any other value is `400` — photos are uploaded
  with `PUT /account/photo`. The same goes for `logo` on
  `/organization/create` and `/organization/update`: logos are uploaded with
  `PUT /orgs/:orgId/logo`. At sign-up, a GitHub or Google avatar URL is kept
  and any other image is dropped.
- **The email address never changes**: `update-user` refuses `email`, and
  `/change-email` is off.
- **Providers**: Google and GitHub join the account only with its own,
  verified address — at sign-in, and through `POST /api/auth/link-social`.
  Another address is refused, and the browser goes to `errorCallbackURL` with
  `?error=email_does_not_match` (or `account_already_linked_to_different_user`).
  `POST /api/auth/unlink-account` takes the `accountId` from `GET /account` and
  needs a sign-in within the last day (`403` `SESSION_NOT_FRESH` otherwise).
  The last way in that works may go only while the instance sends email
  links; a provider the instance turned off doesn't count as one. Otherwise it
  is `400` ("Your only way to sign in…"), and the way out is deleting the
  account. Connects and disconnects are recorded.
- **Delete account**: `POST /api/auth/delete-user`, on a session signed in
  within the last day (`400` `SESSION_EXPIRED` otherwise). The only owner of
  an organization gets `409` with the reason. Memberships, grants, sessions
  and providers go with the person, and their uploaded photo is deleted; rows
  they created stay, without a name.
- **Closed** (`403`): `/list-sessions`, `/revoke-session`, `/revoke-sessions`,
  `/revoke-other-sessions`, `/update-session` (they deal in session tokens — use
  `/api/account/sessions`), `/get-access-token`, `/refresh-token`,
  `/account-info` (they hand out the person's GitHub or Google tokens) and
  `/delete-user/callback`. `/get-session` answers without the session's `token`.

### Inbox and What's new

A person's own (B8): no key reads or marks them. The Inbox is per
organization (`?org=`); the What's new visit is per person.

#### `GET /notifications`

The caller's notifications in the organization, newest first (by when they
last happened), at most 100, with the Show pills' counts over every row:
`all`, `unread`, `action` (needs action). Rows about a workspace or project
the caller can no longer open are left out; a deleted place reads as
"Deleted project" / "Deleted workspace". Kept for 30 days.

Who is told what — never about their own action:

| `event`                     | `kind`    | Sent to                                                                                                                                                | Needs action           |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `access_request.create`     | `request` | the admin the request is addressed to (also emailed)                                                                                                   | while `pending` (live) |
| `access_request.approve`    | `people`  | the asker                                                                                                                                              | no                     |
| `access_request.decline`    | `people`  | the asker                                                                                                                                              | no                     |
| `invitation.accept`         | `people`  | the inviter                                                                                                                                            | no                     |
| `invitation.decline`        | `people`  | the inviter; Undo removes it                                                                                                                           | no                     |
| `invitation.ask_again`      | `people`  | the inviter; Resend or cancelling the invite removes it                                                                                                | yes                    |
| `run.failed`                | `failure` | the workflow's creator and the workspace's admins (emailed once a hour)                                                                                | yes                    |
| `api_key.expiring`          | `expiry`  | the key's creator, 7 days and 1 day before it expires                                                                                                  | yes                    |
| `connection.token_expiring` | `expiry`  | a Cloudflare connection's creator and the org's owners and admins, 7 days and 1 day before its token expires (again for a replaced token's new expiry) | yes                    |
| `connection.token_invalid`  | `expiry`  | the same people, when the daily check finds the token no longer works (once each time it is found so)                                                  | yes                    |
| `workflow.deploy.shared`    | `deploy`  | admins of the project's other workspaces, for a shared workflow                                                                                        | no                     |

Failures of one workflow, and deploys of one shared workflow, fold into one
row per clock hour: `count` goes up, the row moves to the top and is unread
again. Notification emails are capped at 20 per person an hour; past that
the Inbox alone tells them. Rows untouched for 30 days are deleted — except
a pending request's (kept until answered) and an ask about a pending invite
that expired less than 30 days ago. A request row's `request`
carries its id (answer it with `POST /access-requests/:id/approve|decline`),
its status now, and once answered an `outcome` sentence; an answered request
reads as read. `link.to` names where the row leads by slug — `workspace`
(`page`: `workflows` or `runs`), `workspace-settings` (`tab: keys`),
`project-settings` (`page`: `api-keys` or `shared`) or `org-settings`
(`page`: `members` or `api-keys`).

```json
{
  "data": [
    {
      "id": "ntf_…_usr_…",
      "kind": "failure",
      "event": "run.failed",
      "title": "Lead enrichment failed 3 times in the last hour, at step “Fetch company”",
      "where": "Project 101 · Sales",
      "at": "2026-10-30T09:12:44.120Z",
      "read": false,
      "needsAction": true,
      "count": 3,
      "link": {
        "label": "See runs",
        "to": {
          "kind": "workspace",
          "project": "project-101",
          "workspace": "sales",
          "page": "runs"
        }
      }
    }
  ],
  "counts": { "all": 6, "unread": 3, "action": 4 }
}
```

#### `POST /notifications/:id/read`

Marks one of the caller's rows in the organization read: `{ "ok": true }`;
someone else's id, or one in another organization, is `404`.

#### `POST /notifications/read-all`

Marks every unread row of the caller's in the organization read:
`{ "updated": 3 }`. `updated` counts the rows marked now, which can include
answered requests the list already showed as read.

#### `GET /releases/visit` · `PUT /releases/visit`

When the caller last closed What's new and which notes it showed them —
`{ "lastVisit": "2026-10-29T12:00:00.000Z", "seen": ["rel_audit", …] }`, or
`{ "lastVisit": null, "seen": [] }` if never. `PUT` with `{ "seen": [ids] }`
(at most 500, each ≤ 100 characters; `422` otherwise) records now and those
ids. A note is "New to you" until its id is seen, whatever its date: notes
ship with the web app, and reach people when their build does.
