# When a call fails

Read the status and the body before doing anything else. The body is the
message the server means the user to see; quote it rather than paraphrasing it
into "something went wrong".

## Status matrix

| Status | Meaning                                                                                                                                                       | What to do                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `400`  | The route refused the request, or the IR is not valid. An invalid IR carries `details`.                                                                       | Fix the named paths/fields and resend. Do not retry unchanged.                          |
| `401`  | No key, a bad key, or the key's creator lost access.                                                                                                          | Ask for a new key. Do not retry.                                                        |
| `403`  | The key lacks a cell, the role forbids it, or a cross-origin cookie write.                                                                                    | Quote the missing `resource:action` or role reason; ask for the smallest change.        |
| `404`  | Missing **or outside this key's scope**, by design.                                                                                                           | Re-check the ID and scope; do not probe other IDs.                                      |
| `409`  | A precondition lost: the graph or file changed since you read it. The body has `currentGraphHash` or `currentHash`.                                           | Stop. Re-read, show the user the difference, and ask before writing. Never force.       |
| `413`  | The body is over 1 MB.                                                                                                                                        | Split the request into several writes.                                                  |
| `422`  | The body failed the schema (`Validation failed`, with `details` naming each field), or a rule refused the content (a path, a version, a handler, a manifest). | Fix the named fields or content; do not retry unchanged.                                |
| `429`  | Rate limited. `Retry-After` says how long.                                                                                                                    | Wait, then retry once. Do not loop.                                                     |
| `5xx`  | The instance failed.                                                                                                                                          | Report it with `X-Request-Id` if present. Retry once only for a clearly transient read. |

## Graph conflicts (`409`)

`POST /workflows/:id/versions` answers:

```json
{
  "error": "This workflow changed since it was loaded",
  "currentVersionId": "v_…",
  "currentGraphHash": "…"
}
```

The user (or another agent) saved first. Fetch `GET /workflows/:id/full` again,
compare `version.ir` with the graph you were about to write, and tell the user
what would be lost. Only after they choose should you write, now with the fresh
`graphHash` as `baseGraphHash`.

## File conflicts (`409`)

A file write answers with `currentHash` when its `If-Match` (or
`If-None-Match: *`) does not hold. Re-read the file with `GET`, show the two
versions or a diff, and ask. Do not `PUT` without a precondition to "win".

## Invalid IR (`400`)

The details list `path` (for example `nodes.charge.data.code`) and `message`,
and a `nodeId` where one applies. Fix every listed item, then save again. Common
causes:

- `entryNodeId` names a node that is not in `nodes`.
- A duplicate node id, or an edge that names a missing node.
- A step's code is a body where a module is required, or the module's function
  name does not follow the step's variable.
- A script IR contains `sleep`, `sleep_until` or `wait_for_event`.

## Check diagnostics (`ok: false`)

`POST /workflows/:id/source/check` answers `200` with `ok: false` and a list of
`diagnostics`; this is an answer, not an error. Each has a `source` (`ir`,
`provider`, `env`, `compile`, `import`, `library`, …), a `path` when one applies,
and a message. Read `checked` to know what actually ran. There is no type check
in it; do not claim there is.

An expression that names a later node, a missing node or the node itself is
reported here, not by the save: a `POST /versions` with one still succeeds.
Deploys and test runs refuse it.

## Reading the body

Responses are JSON. A paged list is `{ "data": [...] }`; one record is the
object itself. The catalogs `GET /nodes` and `GET /workflows/:id/custom-nodes`
are bare arrays. A node definition's `id` is its type; its `type` is empty. If a body is not JSON, the instance is probably behind a proxy returning
HTML — report the status and the first line, not a guess.
