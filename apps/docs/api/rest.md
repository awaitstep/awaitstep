---
title: REST API
---

<style>
.api-method {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
  letter-spacing: 0.02em;
  vertical-align: middle;
  margin-right: 6px;
}
.api-method.get { background: #dbeafe; color: #1d4ed8; }
.api-method.post { background: #dcfce7; color: #166534; }
.api-method.patch { background: #fef3c7; color: #92400e; }
.api-method.put { background: #ede9fe; color: #5b21b6; }
.api-method.delete { background: #fee2e2; color: #991b1b; }
.dark .api-method.get { background: #1e3a5f; color: #93c5fd; }
.dark .api-method.post { background: #14532d; color: #86efac; }
.dark .api-method.patch { background: #422006; color: #fcd34d; }
.dark .api-method.put { background: #2e1065; color: #c4b5fd; }
.dark .api-method.delete { background: #450a0a; color: #fca5a5; }
.api-endpoint {
  font-family: var(--vp-font-family-mono);
  font-size: 0.95rem;
  vertical-align: middle;
}
.api-scope {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--vp-c-default-soft);
  margin-left: 8px;
  vertical-align: middle;
}
</style>

# REST API

All endpoints require authentication via API key (`Authorization: Bearer ask_...`) or session cookie.

An API key is minted at one **level** — the organization, a project, or one workspace — and carries a **grid** of permissions from that level's catalog: the resources it may touch and the actions (`read`, `write`, `delete`, `deploy`, `run`) it may take on them. Every endpoint below names the cell it needs as <span class="api-scope">resource:action</span>; a key without it answers `403`. An organization key never reaches a project route, and a project or workspace key never manages organization resources, whatever its grid. Where a project or workspace key reaches an organization resource through its own grid (the connections and nodes its workflows deploy with, the variables they resolve against), the second badge is its cell. A workspace key is pinned to its workspace: every list is cut to it and anything elsewhere in the project is not found.

| Level        | Reaches                                       | Resources                                                                                                             |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| organization | the organization's settings, never a workflow | `projects`, `members` (read), `connections`, `resources` (nodes, the marketplace, org-wide variables), `audit` (read) |
| project      | everything in one project, every workspace    | `workspaces`, `workflows`, `runs` (read), `variables`, `members` (read)                                               |
| workspace    | one workspace of a project                    | `workflows`, `runs` (read), `variables`                                                                               |

A key acts with the standing of whoever minted it — a key minted by a Viewer cannot edit workflows — and stops working (`401`) when its creator leaves the organization or can no longer open the key's project or workspace.

**Base URL:** `https://your-instance/api`

## Authentication

```bash
# API key
curl https://your-instance/api/workflows \
  -H "Authorization: Bearer ask_your_api_key"
```

## Rate Limits

| Scope                   | Limit               |
| ----------------------- | ------------------- |
| Global                  | 200 req/min per IP  |
| Write operations        | 30 req/min per user |
| Deploy operations       | 10 req/min per user |
| Credential verification | 10 req/min per user |

## Pagination

All list endpoints support cursor-based pagination via `cursor` and `limit` query parameters.

```json
{
  "data": [...],
  "nextCursor": "abc123_2026-03-29T10:00:00.000Z"
}
```

When `nextCursor` is `null`, there are no more pages.

---

## Workflows

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows</span> <span class="api-scope">workflows:read</span>

List all workflows in the active project.

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">workflows:read</span>

Get a single workflow by ID.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:id/full</span> <span class="api-scope">workflows:read</span>

Get a workflow with its current version, all version summaries, and active deployment.

| Param     | In    | Required | Description                 |
| --------- | ----- | -------- | --------------------------- |
| `version` | query | no       | Specific version ID to load |

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows</span> <span class="api-scope">workflows:write</span>

Create a new workflow or function.

**Request body:**

```json
{
  "name": "My Workflow",
  "description": "",
  "kind": "workflow"
}
```

| Field         | Required | Description                                                                                                                                                                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Display name                                                                                                                                                                                                                                 |
| `description` | no       | Optional description                                                                                                                                                                                                                         |
| `kind`        | no       | `"workflow"` (default) or `"script"`. Functions (`kind: "script"`) are fetch-only Workers — no durable runtime, no Runs. Set at create time only; cannot be changed via `PATCH`. See [Functions](#functions) for constraints and invocation. |

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">workflows:write</span>

Update a workflow's name, description, environment variables, trigger code, dependencies, or deploy config.

**Request body:**

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

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:id/move</span> <span class="api-scope">session only</span>

Move a workflow to another project within the same organization. A share to the old project does not follow it.

**Request body:**

```json
{ "targetProjectId": "project-id" }
```

---

### <span class="api-method put">PUT</span> <span class="api-endpoint">/workflows/:id/share</span> <span class="api-scope">workflows:write</span>

Share a workflow or function to its project, or stop. A shared item is listed to everyone in the project and is what a Call Workflow step picks from. Sharing shows what it is — its name, kind, deployed version, workspace and who shared it — not the item: someone who can't open its workspace still can't read its graph, code, variables or runs. Needs an admin or editor of the workflow's own workspace; a viewer answers `403`.

**Request body:**

```json
{ "shared": true }
```

Answers `{ "sharing": { "sharedAt": "...", "sharedBy": { "id": "usr_...", "name": "Ama Mensah" } } }`, or `{ "sharing": null }` when off. Sharing again keeps who shared it and when. If the workflow moves to another workspace while the request is in flight, it answers `409` and changes nothing. `GET /workflows` rows carry the same `sharing` field; workflow rows also carry the raw `sharedBy` (user id) and `sharedAt` columns.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">workflows:delete</span>

Delete a workflow and all its versions, deployments, and runs.

---

## Functions

Functions are workflows with `kind: "script"`. They share the same routes (POST `/workflows` to create, PATCH to update, DELETE to remove, POST `/versions` to compile a new version, POST `/deploy` to deploy) but compile to a fetch-only Cloudflare Worker instead of a `WorkflowEntrypoint` class.

### Constraints

- **HTTP-only trigger.** Script IR requires `trigger: { type: "http" }`. Cron, event, and manual triggers are rejected at validation.
- **No durable-runtime nodes.** `sleep`, `sleep_until`, and `wait_for_event` are rejected — they require a durable instance the script doesn't have.
- **No `WORKFLOW` self-binding.** The generated Worker has no Workflow binding to itself. Sub-workflow bindings (calls into other deployed workflows) and resource bindings (KV/D1/R2/etc.) are still detected.
- **No instance lifecycle.** No Runs, no pause/resume/terminate. `POST /workflows/:id/trigger` returns 400. Invoke the deployed Worker URL directly via HTTP POST.
- **`kind` is immutable.** Set at create time only; not accepted on PATCH.

### Invocation

```bash
curl -X POST https://<your-worker-url> \
  -H "Content-Type: application/json" \
  -d '{ "anything": "here" }'
```

The body is parsed and exposed to nodes as `event.payload`. The default response is `Response.json(graph)` where `graph` contains only nodes whose display name was prefixed with `EXPORT_`. Override the fetch handler body via the workflow's `triggerCode` field (PATCH `/workflows/:id`); the auto-generated `runGraph(env, event)` function and `graph.*` outputs stay stable across edits.

See [Compilation → Full Generated Worker Shape](/concepts/compilation#script-shape-kind-script) for the emitted code, and [Workflow IR → Scripts vs Workflows](/concepts/workflow-ir#scripts-vs-workflows) for the type-level split.

---

## Projects

### <span class="api-method get">GET</span> <span class="api-endpoint">/projects</span> <span class="api-scope">projects:read</span>

List all projects in the active organization.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/projects</span> <span class="api-scope">projects:write</span>

Create a new project.

**Request body:**

```json
{
  "name": "My Project",
  "slug": "my-project",
  "description": ""
}
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/projects/:id</span> <span class="api-scope">projects:write</span>

Update a project's name or description.

**Request body:**

```json
{ "name": "Updated Name", "description": "optional" }
```

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/projects/:id</span> <span class="api-scope">projects:delete</span>

Delete a project with its workspaces and workflows. While the project, or a workspace in it, has its deletion lock on, this answers `409` and deletes nothing.

---

### <span class="api-method put">PUT</span> <span class="api-endpoint">/projects/:id/lock</span> <span class="api-scope">session only</span>

Turn the project's deletion lock on or off (project admins). While it is on, the project cannot be deleted or moved to another organization, and none of its workspaces can be deleted. An API key cannot change a lock, whatever it holds: a key that may delete must not be able to lift the lock first. A workspace has its own lock at `PUT /workspaces/:id/lock` (its admins and editors), refused with `409` while the project is locked.

**Request body:**

```json
{ "locked": true }
```

Answers `{ "lock": { "setBy": { "id": "usr_...", "name": "Ama Mensah" }, "setAt": "..." } }`, or `{ "lock": null }` when off. Turning on a lock that is already on keeps who set it and when. The lock guards the project and its workspaces themselves, not what is in them: workflows, keys and variables inside are still edited and deleted as their own permissions allow.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/projects/:id/shared</span> <span class="api-scope">session only</span>

The project's Shared library: every workflow and function shared to it, newest share first, with `kind`, `cursor` and `limit` query parameters. Each item has `id`, `name`, `kind`, `version` (deployed, or null), `sharedAt`, `sharedBy`, `from` (its workspace: `id`, `slug`, `name`, `colour`), `usedBy`, `canOpen` (whether you can open `from`) and `unshare` (whether you may unshare it, and why not). Items from workspaces you can't open are listed too, by name only.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workspaces/:id/shared</span> <span class="api-scope">workflows:read</span>

What the project's other workspaces shared, read-only here: the same items as `GET /projects/:id/shared`, without the workspace's own. `unshare` is always refused here ("Unshare it from its own workspace"), and a workspace key gets `canOpen: false` on every row (it opens only its own workspace).

---

## Versions

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/versions</span> <span class="api-scope">workflows:read</span>

List all versions for a workflow.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">workflows:read</span>

Get a specific version including its IR and generated code.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/versions</span> <span class="api-scope">workflows:write</span>

Create a new version by submitting a workflow IR. The IR is validated and compiled to code.

**Request body:**

```json
{ "ir": { ... } }
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">workflows:write</span>

Lock or unlock a version. Locked versions cannot be deployed.

**Request body:**

```json
{ "locked": true }
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId/revert</span> <span class="api-scope">workflows:write</span>

Revert to a previous version. Creates a new version with the target version's IR.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">workflows:delete</span>

Delete a version. Cannot delete the active, deployed, or locked version.

---

## Deployments

### <span class="api-method get">GET</span> <span class="api-endpoint">/deployments</span> <span class="api-scope">runs:read</span>

List all deployments across all workflows.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/deployments</span> <span class="api-scope">runs:read</span>

List deployments for a specific workflow.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/deploy</span> <span class="api-scope">workflows:deploy</span>

Deploy a workflow version to a connection. Validates environment variables and credentials before deploying.

**Request body:**

```json
{
  "connectionId": "connection-id",
  "versionId": "optional-version-id"
}
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/deploy-stream</span> <span class="api-scope">workflows:deploy</span>

Deploy with real-time progress updates via Server-Sent Events. Same request body as `/deploy`.

**Progress stages:**

```
INITIALIZING → GENERATING_CODE → CODE_READY → DETECTING_BINDINGS →
BINDINGS_READY → CREATING_WORKER → DEPLOYING → WORKER_DEPLOYED →
UPDATING_WORKFLOW → COMPLETED
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/trigger</span> <span class="api-scope">workflows:run</span>

Trigger an execution of a deployed workflow. Params payload is capped at 100 KB.

::: warning Functions only
This endpoint is for `kind: "workflow"` only. Calling it on a function (`kind: "script"`) returns 400 — functions have no instance lifecycle. Invoke the deployed Worker URL directly via HTTP POST instead. See [Functions → Invocation](#invocation).
:::

**Request body:**

```json
{
  "connectionId": "connection-id",
  "params": { "key": "value" }
}
```

**Response:**

```json
{
  "id": "run-id",
  "instanceId": "cf-instance-id",
  "status": "queued"
}
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/takedown</span> <span class="api-scope">workflows:deploy</span>

Remove a deployment and clear the workflow's active version.

**Request body:**

```json
{ "connectionId": "connection-id" }
```

---

## Runs

### <span class="api-method get">GET</span> <span class="api-endpoint">/runs</span> <span class="api-scope">runs:read</span>

List all runs across all workflows.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/runs</span> <span class="api-scope">runs:read</span>

List runs for a specific workflow.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId</span> <span class="api-scope">runs:read</span>

Get a specific run. If the run is in a non-terminal state, live status is fetched from Cloudflare.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/pause</span> <span class="api-scope">workflows:run</span>

Pause a running workflow instance.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/resume</span> <span class="api-scope">workflows:run</span>

Resume a paused workflow instance.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/terminate</span> <span class="api-scope">workflows:run</span>

Terminate a running or paused workflow instance.

---

## Connections

### <span class="api-method get">GET</span> <span class="api-endpoint">/connections</span> <span class="api-scope">connections:read</span> <span class="api-scope">workflows:read</span>

List all connections. Credential values are redacted in the response.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/connections</span> <span class="api-scope">connections:write</span>

Create a new provider connection.

**Request body:**

```json
{
  "provider": "cloudflare",
  "credentials": { "apiToken": "...", "accountId": "..." },
  "name": "My Connection"
}
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/connections/verify-token</span> <span class="api-scope">connections:read</span> <span class="api-scope">workflows:read</span>

Verify provider credentials before saving.

**Request body:**

```json
{ "provider": "cloudflare", "credentials": { "apiToken": "..." } }
```

**Response:**

```json
{
  "valid": true,
  "accounts": [{ "id": "abc123", "name": "My Account" }]
}
```

Failed checks lock per person: three are free in an hour, then each failure waits 30 seconds, doubling up to 5 minutes, and a valid token doesn't clear the count. A key's checks count against all keys its creator minted, never the creator's own dashboard. While locked the check answers `429` with a `Retry-After` header and nothing reaches Cloudflare.

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/connections/:id</span> <span class="api-scope">connections:write</span>

Update a connection's name or credentials.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/connections/:id</span> <span class="api-scope">connections:delete</span>

Delete a connection.

---

## Environment Variables

A variable is set at one of three **levels** — the organization, a project, or one workspace — and a workflow's `{{global.env.NAME}}` references resolve against its own workspace, then its project, then the organization: the closest level wins. Every call is addressed at a level in the query, as keys are: `?org=` the organization's own, `&project=` a project's own, `&workspace=` a workspace's own. A key's pin is its address. Anyone who can open the level reads its variables; setting, editing and deleting them is for whoever manages the level (org owners and admins, project admins, that workspace's admins). A name already set at the level answers `409`; secret values are masked in every read.

### <span class="api-method get">GET</span> <span class="api-endpoint">/env-vars</span> <span class="api-scope">resources:read</span> <span class="api-scope">variables:read</span>

The addressed level's own variables, paginated. The organization's carry `overriddenIn`: how many projects the caller can open set the name themselves.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/env-vars/resolved</span> <span class="api-scope">resources:read</span> <span class="api-scope">variables:read</span>

A project's or a workspace's resolved view: each name once with where its value is set (`setAt` / `source`), what it overrides, and which workspaces override it. Addressed at the organization alone: `400`.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/env-vars</span> <span class="api-scope">resources:write</span> <span class="api-scope">variables:write</span>

Set a variable at the addressed level. Name must match `^[A-Z][A-Z0-9_]*$`.

**Request body:**

```json
{ "name": "MY_VAR", "value": "my-value", "isSecret": false }
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/env-vars/:id</span> <span class="api-scope">resources:write</span> <span class="api-scope">variables:write</span>

Update a variable's name, value, or secret flag, where it is addressed. Un-hiding a secret needs a new `value` (`422` otherwise).

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/env-vars/:id</span> <span class="api-scope">resources:delete</span> <span class="api-scope">variables:delete</span>

Delete a variable at the addressed level.

---

## Nodes

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

List all available node definitions from the registry.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes/templates</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

Get node template resolver data.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes/:nodeId</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

Get a single node definition.

---

## Marketplace

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

Get the full marketplace catalog with installation status for the current organization.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace/:nodeId</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

Get details for a specific marketplace node, including available versions and installation status.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace/installed</span> <span class="api-scope">resources:read</span> <span class="api-scope">workflows:read</span>

List installed marketplace nodes for the current organization.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/install</span> <span class="api-scope">resources:write</span>

Install a node from the marketplace.

**Request body:**

```json
{ "nodeId": "stripe", "version": "1.0.0" }
```

`version` is optional — defaults to the latest available version.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/uninstall</span> <span class="api-scope">resources:delete</span>

Uninstall a previously installed node.

**Request body:**

```json
{ "nodeId": "stripe" }
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/update</span> <span class="api-scope">resources:write</span>

Update an installed node to a newer version.

**Request body:**

```json
{ "nodeId": "stripe", "version": "1.1.0" }
```

---

## Audit Log

### <span class="api-method get">GET</span> <span class="api-endpoint">/audit-events</span> <span class="api-scope">audit:read</span>

Who changed what in the organization, newest first, kept for 90 days: deletions (and deletions the deletion lock blocked), API keys, connections, variables, access changes, shares, deletion locks, deploys, marketplace installs, sign-ins and failed token checks. Org owners and admins only; an organization key reads it as its creator. Values, credentials and key secrets are never recorded, and addresses are kept cut to `81.2.69.x`.

**Query:** `org` (or `organizationId`), `level` (`organization`, `project`, `workspace`), `period` (`24h`, `7d` default, `30d`, `90d`), `search` (actor, action or target), `cursor`, `limit`.

**Response:**

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

---

## Inbox <span class="api-scope">session only</span>

A person's own notifications in one organization (`?org=<slug>`), newest first, kept for 30 days. No key reads or marks them.

### <span class="api-method get">GET</span> <span class="api-endpoint">/notifications</span>

At most 100 rows, with the counts over every row: `all`, `unread`, `action` (needs action). Edit-access requests (to the admin asked, also emailed), the answer to your request, invites accepted, declined or asked about again (to the inviter), failing workflows (to the creator and the workspace's admins, emailed at most once an hour; repeats in the hour fold into one row with a `count`), API keys about to expire (to the creator, 7 days and 1 day before), and deploys of a shared workflow (to admins of the project's other workspaces, folded per workflow per hour). At most 20 notification emails reach one person an hour. Nobody is told about their own action.

**Response:**

```json
{
  "data": [
    {
      "id": "ntf_…",
      "kind": "request",
      "event": "access_request.create",
      "title": "Eve Park asked for edit access to Sales",
      "where": "Project 101 · Sales",
      "at": "2026-10-30T09:12:44.120Z",
      "read": false,
      "needsAction": true,
      "count": 1,
      "request": { "id": "req_…", "status": "pending" }
    }
  ],
  "counts": { "all": 1, "unread": 1, "action": 1 }
}
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/notifications/:id/read</span>

Marks one of your rows read. Someone else's, or one in another organization, is `404`.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/notifications/read-all</span>

Marks all your unread rows in the organization read: `{ "updated": 3 }`.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/releases/visit</span>

When you last closed What's new and the notes it showed: `{ "lastVisit": "…", "seen": ["rel_…"] }` (`null` and `[]` if never). `PUT` with `{ "seen": [ids] }` records now and those ids; a note stays "New to you" until its id is seen.

---

## API Keys <span class="api-scope">session only</span>

Keys never manage keys: these endpoints take a session, addressed at the level they manage — `?org=<slug>` the organization's keys (owners and admins), `?org=&project=<slug>` a project's (its admins), `?org=&project=&workspace=<slug>` a workspace's (its admins). A workspace named without its project is `400`.

### <span class="api-method get">GET</span> <span class="api-endpoint">/api-keys</span>

The keys of the addressed level: the organization's own; a project's own with `workspaceCounts` (unrevoked keys per workspace the caller can open); a workspace's `own` keys and the `inherited` project keys that reach it. Revoked keys never return; the secret never does.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/api-keys</span>

Mint a key at the addressed level. `level` must be the addressed one (`400`); `permissions` is the grid — only cells the level offers (`422` naming any other), at least one (`422`); `expiresAt` is optional and must be in the future (`422`). The secret is returned once, as `key`, beside the key's record (its level, grid, `keyPrefix` and `keySuffix`, who minted it and — for a workspace key — its `workspace`).

**Request body:**

```json
{
  "name": "CI deploys",
  "level": "project",
  "permissions": { "workflows": ["read", "deploy", "run"], "runs": ["read"] },
  "expiresAt": "2026-12-31T00:00:00Z"
}
```

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/api-keys/:id</span>

Revoke a key of the addressed level; a key of another level at that address is `404`.
