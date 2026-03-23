# API Reference

All endpoints require authentication via API key (`Authorization: Bearer ask_...`) or session cookie.

API keys are scoped: `read` (queries), `write` (create/update/delete), `deploy` (deploy/trigger/takedown/run control). All keys require at least `read` scope.

Base URL: `https://app.awaitstep.dev/api`

## Rate Limits

| Scope | Limit |
|-------|-------|
| Global | 200 req/min per IP |
| Write operations | 30 req/min per user |
| Deploy operations | 10 req/min per user |
| Credential verification | 10 req/min per user |
| Resource queries (D1) | 20 req/min per user |

---

## Workflows

### `GET /workflows`
List all workflows in the active project.

**Scope:** `read`

### `GET /workflows/:id`
Get a single workflow by ID.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Workflow ID |

### `GET /workflows/:id/full`
Get a workflow with its current version, all version summaries, and active deployment.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Workflow ID |
| `version` | query | no | Specific version ID to load |

### `POST /workflows`
Create a new workflow.

**Scope:** `write`
```json
{
  "name": "My Workflow",
  "description": ""
}
```

### `PATCH /workflows/:id`
Update a workflow's name, description, environment variables, trigger code, or dependencies.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Workflow ID |

```json
{
  "name": "Updated Name",
  "description": "optional",
  "envVars": [{ "name": "KEY", "value": "val", "isSecret": false }],
  "triggerCode": "optional trigger code string",
  "dependencies": { "lodash": "^4.0.0" }
}
```

### `PATCH /workflows/:id/move`
Move a workflow to another project within the same organization. Returns warnings if the workflow references env vars missing in the target project.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Workflow ID |

```json
{
  "targetProjectId": "project-id"
}
```

### `DELETE /workflows/:id`
Delete a workflow.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Workflow ID |

---

## Projects

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
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Project ID |

```json
{
  "name": "Updated Name",
  "description": "optional"
}
```

### `DELETE /projects/:id`
Delete a project.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Project ID |

---

## Versions

### `GET /workflows/:workflowId/versions`
List all versions for a workflow.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

### `GET /workflows/:workflowId/versions/:versionId`
Get a specific version including its IR and generated code.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `versionId` | path | yes | Version ID |

### `POST /workflows/:workflowId/versions`
Create a new version by submitting a workflow IR. The IR is validated and compiled to code.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

```json
{
  "ir": { }
}
```

### `PATCH /workflows/:workflowId/versions/:versionId`
Lock or unlock a version. Locked versions cannot be deployed.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `versionId` | path | yes | Version ID |

```json
{
  "locked": true
}
```

### `POST /workflows/:workflowId/versions/:versionId/revert`
Revert to a previous version. Creates a new version with the target version's IR and sets it as the current version.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `versionId` | path | yes | Version ID to revert to |

### `DELETE /workflows/:workflowId/versions/:versionId`
Delete a version. Cannot delete the active version, a deployed version, or a locked version.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `versionId` | path | yes | Version ID |

---

## Deployments

### `GET /deployments`
List all deployments across all workflows for the authenticated user.

**Scope:** `read`

### `GET /workflows/:workflowId/deployments`
List deployments for a specific workflow.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

### `POST /workflows/:workflowId/deploy`
Deploy a workflow version to a connection. Validates environment variables and credentials before deploying.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

```json
{
  "connectionId": "connection-id",
  "versionId": "optional-version-id"
}
```

### `POST /workflows/:workflowId/trigger`
Trigger an execution of a deployed workflow. Params payload is capped at 100KB.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

```json
{
  "connectionId": "connection-id",
  "params": {}
}
```

### `POST /workflows/:workflowId/takedown`
Remove a deployment and clear the workflow's active version.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

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
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |

### `GET /workflows/:workflowId/runs/:runId`
Get a specific run. If the run is in a non-terminal state, live status is fetched from Cloudflare.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `runId` | path | yes | Run ID |

### `POST /workflows/:workflowId/runs/:runId/pause`
Pause a running workflow instance.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `runId` | path | yes | Run ID |

### `POST /workflows/:workflowId/runs/:runId/resume`
Resume a paused workflow instance.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `runId` | path | yes | Run ID |

### `POST /workflows/:workflowId/runs/:runId/terminate`
Terminate a running or paused workflow instance.

**Scope:** `deploy`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `workflowId` | path | yes | Workflow ID |
| `runId` | path | yes | Run ID |

---

## Connections

### `GET /connections`
List all connections. Credential values are redacted in the response.

**Scope:** `read`

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

### `PATCH /connections/:id`
Update a connection's name or credentials.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Connection ID |

```json
{
  "name": "Updated Name",
  "credentials": { "apiToken": "new-token" }
}
```

### `DELETE /connections/:id`
Delete a connection.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Connection ID |

---

## Environment Variables

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
Update an environment variable's name, value, or secret flag.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Environment variable ID |

```json
{
  "value": "new-value"
}
```

### `DELETE /env-vars/:id`
Delete an environment variable.

**Scope:** `write`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `id` | path | yes | Environment variable ID |

---

## Resources

All resource endpoints require a `connectionId` query parameter pointing to a valid Cloudflare connection.

### `GET /resources/kv/namespaces`
List KV namespaces.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `connectionId` | query | yes | Connection ID |

### `GET /resources/kv/namespaces/:namespaceId/keys`
List keys in a KV namespace.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `namespaceId` | path | yes | KV namespace ID |
| `connectionId` | query | yes | Connection ID |
| `prefix` | query | no | Filter keys by prefix |
| `cursor` | query | no | Pagination cursor |
| `limit` | query | no | Max keys to return |

### `GET /resources/kv/namespaces/:namespaceId/values/:key`
Get the value of a KV key.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `namespaceId` | path | yes | KV namespace ID |
| `key` | path | yes | Key name |
| `connectionId` | query | yes | Connection ID |

### `GET /resources/d1/databases`
List D1 databases.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `connectionId` | query | yes | Connection ID |

### `POST /resources/d1/databases/:databaseId/query`
Execute a SQL query against a D1 database.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `databaseId` | path | yes | D1 database ID |

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
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `connectionId` | query | yes | Connection ID |

### `GET /resources/r2/buckets/:bucketName/objects`
List objects in an R2 bucket.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `bucketName` | path | yes | Bucket name |
| `connectionId` | query | yes | Connection ID |
| `prefix` | query | no | Filter by prefix |
| `cursor` | query | no | Pagination cursor |
| `limit` | query | no | Max objects to return |

---

## Nodes

### `GET /nodes`
List all available node definitions from the registry.

**Scope:** `read`

### `GET /nodes/templates`
Get node template resolver data.

**Scope:** `read`

### `GET /nodes/:nodeId`
Get a single node definition.

**Scope:** `read`
| Param | In | Required | Description |
|-------|----|----------|-------------|
| `nodeId` | path | yes | Node type ID |

---

## Session-Only Endpoints

These endpoints require session authentication and are **not accessible via API key**.

### `GET /api-keys`
List all API keys for the authenticated user.

### `POST /api-keys`
Create a new API key. The full key is returned only once in the response.
```json
{
  "name": "My Key",
  "scopes": ["read", "write"],
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

### `DELETE /api-keys/:id`
Revoke an API key.
