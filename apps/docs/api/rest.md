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
.api-method.delete { background: #fee2e2; color: #991b1b; }
.dark .api-method.get { background: #1e3a5f; color: #93c5fd; }
.dark .api-method.post { background: #14532d; color: #86efac; }
.dark .api-method.patch { background: #422006; color: #fcd34d; }
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

API keys are scoped: **read** (queries), **write** (create/update/delete), **deploy** (deploy/trigger/takedown/run control). All keys require at least `read` scope.

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

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows</span> <span class="api-scope">read</span>

List all workflows in the active project.

| Param    | In    | Required | Description                        |
| -------- | ----- | -------- | ---------------------------------- |
| `cursor` | query | no       | Pagination cursor                  |
| `limit`  | query | no       | Items per page (1–100, default 50) |

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">read</span>

Get a single workflow by ID.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:id/full</span> <span class="api-scope">read</span>

Get a workflow with its current version, all version summaries, and active deployment.

| Param     | In    | Required | Description                 |
| --------- | ----- | -------- | --------------------------- |
| `version` | query | no       | Specific version ID to load |

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows</span> <span class="api-scope">write</span>

Create a new workflow.

**Request body:**

```json
{
  "name": "My Workflow",
  "description": ""
}
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">write</span>

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

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:id/move</span> <span class="api-scope">write</span>

Move a workflow to another project within the same organization.

**Request body:**

```json
{ "targetProjectId": "project-id" }
```

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/workflows/:id</span> <span class="api-scope">write</span>

Delete a workflow and all its versions, deployments, and runs.

---

## Projects

### <span class="api-method get">GET</span> <span class="api-endpoint">/projects</span> <span class="api-scope">read</span>

List all projects in the active organization.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/projects</span> <span class="api-scope">write</span>

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

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/projects/:id</span> <span class="api-scope">write</span>

Update a project's name or description.

**Request body:**

```json
{ "name": "Updated Name", "description": "optional" }
```

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/projects/:id</span> <span class="api-scope">write</span>

Delete a project.

---

## Versions

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/versions</span> <span class="api-scope">read</span>

List all versions for a workflow.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">read</span>

Get a specific version including its IR and generated code.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/versions</span> <span class="api-scope">write</span>

Create a new version by submitting a workflow IR. The IR is validated and compiled to code.

**Request body:**

```json
{ "ir": { ... } }
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">write</span>

Lock or unlock a version. Locked versions cannot be deployed.

**Request body:**

```json
{ "locked": true }
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId/revert</span> <span class="api-scope">write</span>

Revert to a previous version. Creates a new version with the target version's IR.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/workflows/:workflowId/versions/:versionId</span> <span class="api-scope">write</span>

Delete a version. Cannot delete the active, deployed, or locked version.

---

## Deployments

### <span class="api-method get">GET</span> <span class="api-endpoint">/deployments</span> <span class="api-scope">read</span>

List all deployments across all workflows.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/deployments</span> <span class="api-scope">read</span>

List deployments for a specific workflow.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/deploy</span> <span class="api-scope">deploy</span>

Deploy a workflow version to a connection. Validates environment variables and credentials before deploying.

**Request body:**

```json
{
  "connectionId": "connection-id",
  "versionId": "optional-version-id"
}
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/deploy-stream</span> <span class="api-scope">deploy</span>

Deploy with real-time progress updates via Server-Sent Events. Same request body as `/deploy`.

**Progress stages:**

```
INITIALIZING → GENERATING_CODE → CODE_READY → DETECTING_BINDINGS →
BINDINGS_READY → CREATING_WORKER → DEPLOYING → WORKER_DEPLOYED →
UPDATING_WORKFLOW → COMPLETED
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/trigger</span> <span class="api-scope">deploy</span>

Trigger an execution of a deployed workflow. Params payload is capped at 100 KB.

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

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/takedown</span> <span class="api-scope">deploy</span>

Remove a deployment and clear the workflow's active version.

**Request body:**

```json
{ "connectionId": "connection-id" }
```

---

## Runs

### <span class="api-method get">GET</span> <span class="api-endpoint">/runs</span> <span class="api-scope">read</span>

List all runs across all workflows.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/runs</span> <span class="api-scope">read</span>

List runs for a specific workflow.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId</span> <span class="api-scope">read</span>

Get a specific run. If the run is in a non-terminal state, live status is fetched from Cloudflare.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/pause</span> <span class="api-scope">deploy</span>

Pause a running workflow instance.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/resume</span> <span class="api-scope">deploy</span>

Resume a paused workflow instance.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/workflows/:workflowId/runs/:runId/terminate</span> <span class="api-scope">deploy</span>

Terminate a running or paused workflow instance.

---

## Connections

### <span class="api-method get">GET</span> <span class="api-endpoint">/connections</span> <span class="api-scope">read</span>

List all connections. Credential values are redacted in the response.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/connections</span> <span class="api-scope">write</span>

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

### <span class="api-method post">POST</span> <span class="api-endpoint">/connections/verify-token</span> <span class="api-scope">write</span>

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

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/connections/:id</span> <span class="api-scope">write</span>

Update a connection's name or credentials.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/connections/:id</span> <span class="api-scope">write</span>

Delete a connection.

---

## Environment Variables

### <span class="api-method get">GET</span> <span class="api-endpoint">/env-vars</span> <span class="api-scope">read</span>

List all global environment variables. Secret values are masked.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/env-vars</span> <span class="api-scope">write</span>

Create a global environment variable. Name must match `^[A-Z][A-Z0-9_]*$`.

**Request body:**

```json
{ "name": "MY_VAR", "value": "my-value", "isSecret": false }
```

---

### <span class="api-method patch">PATCH</span> <span class="api-endpoint">/env-vars/:id</span> <span class="api-scope">write</span>

Update an environment variable's name, value, or secret flag.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/env-vars/:id</span> <span class="api-scope">write</span>

Delete an environment variable.

---

## Resources

All resource endpoints require a `connectionId` query parameter pointing to a valid Cloudflare connection.

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/kv/namespaces</span> <span class="api-scope">read</span>

List KV namespaces.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/kv/namespaces/:namespaceId/keys</span> <span class="api-scope">read</span>

List keys in a KV namespace. Supports `prefix`, `cursor`, and `limit` query params.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/kv/namespaces/:namespaceId/values/:key</span> <span class="api-scope">read</span>

Get the value of a KV key.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/d1/databases</span> <span class="api-scope">read</span>

List D1 databases.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/resources/d1/databases/:databaseId/query</span> <span class="api-scope">read</span>

Execute a SQL query against a D1 database.

**Request body:**

```json
{ "connectionId": "connection-id", "sql": "SELECT 1", "params": [] }
```

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/r2/buckets</span> <span class="api-scope">read</span>

List R2 buckets.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/resources/r2/buckets/:bucketName/objects</span> <span class="api-scope">read</span>

List objects in an R2 bucket. Supports `prefix`, `cursor`, and `limit` query params.

---

## Nodes

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes</span> <span class="api-scope">read</span>

List all available node definitions from the registry.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes/templates</span> <span class="api-scope">read</span>

Get node template resolver data.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/nodes/:nodeId</span> <span class="api-scope">read</span>

Get a single node definition.

---

## Marketplace

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace</span> <span class="api-scope">read</span>

Get the full marketplace catalog with installation status for the current organization.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace/:nodeId</span> <span class="api-scope">read</span>

Get details for a specific marketplace node, including available versions and installation status.

---

### <span class="api-method get">GET</span> <span class="api-endpoint">/marketplace/installed</span> <span class="api-scope">read</span>

List installed marketplace nodes for the current organization.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/install</span> <span class="api-scope">write</span>

Install a node from the marketplace.

**Request body:**

```json
{ "nodeId": "stripe", "version": "1.0.0" }
```

`version` is optional — defaults to the latest available version.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/uninstall</span> <span class="api-scope">write</span>

Uninstall a previously installed node.

**Request body:**

```json
{ "nodeId": "stripe" }
```

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/marketplace/update</span> <span class="api-scope">write</span>

Update an installed node to a newer version.

**Request body:**

```json
{ "nodeId": "stripe", "version": "1.1.0" }
```

---

## API Keys <span class="api-scope">session only</span>

These endpoints require session authentication and are **not accessible via API key**.

### <span class="api-method get">GET</span> <span class="api-endpoint">/api-keys</span>

List all API keys for the current organization.

---

### <span class="api-method post">POST</span> <span class="api-endpoint">/api-keys</span>

Create a new API key scoped to a project. The full key is returned only once.

**Request body:**

```json
{
  "name": "My Key",
  "projectId": "project-id",
  "scopes": ["read", "write"],
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

`expiresAt` is optional.

---

### <span class="api-method delete">DELETE</span> <span class="api-endpoint">/api-keys/:id</span>

Revoke an API key.
