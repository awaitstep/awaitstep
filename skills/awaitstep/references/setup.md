# Setup, scope and keys

## Base URL

| Where the instance runs | API root                                         |
| ----------------------- | ------------------------------------------------ |
| AwaitStep Cloud         | `https://app.awaitstep.dev/api`                  |
| Self-hosted, `pnpm dev` | `http://localhost:8080/api`                      |
| Self-hosted, deployed   | `https://<your-instance>/api` (whatever it uses) |

The docs use `https://docs.awaitstep.dev`; links there are documentation, not
your instance. Confirm the base URL with the user before the first call.

## The API key

An API key starts with `ask_`, is created in the dashboard under **API keys**,
and acts with the standing of the person who minted it. It is bound to a
**level**:

- **Organization** — organization settings only. It can never read a workflow or
  the Library.
- **Project** — every workspace of the chosen project(s), including workspaces
  created later.
- **Workspace** — one workspace of one project.

A project key is the usual choice for building. A workspace key is narrower and
fine for a single workspace. A key minted by a Viewer cannot edit even if its
grid includes `workflows:write`.

If a call answers `401`, the key is missing, expired, or its creator can no
longer open the project or workspace. If it answers `403 API key lacks
permission: <resource>:<action>`, ask the user to add that cell or mint a key
with it; do not retry.

## Addressing a project and workspace

Project-scoped routes take the project one of two ways:

```
?projectId=<id>
?org=<org-slug>&project=<project-slug>
```

A workspace is named on any project-scoped route with `?workspaceId=<id>` or
`?workspace=<slug>`. It must belong to the project, or the answer is `404`.

How a key resolves an unnamed scope:

- A project key that reaches **one** project defaults to it; one that reaches
  several needs the project named (`400` otherwise).
- A workspace key that reaches **one** workspace defaults to it; naming a
  workspace outside its set is a `404`.

A resource outside the key's set is `404`, exactly like one that does not exist.
Do not read a `404` as "the feature is missing"; it may be scope.

Set `AWAITSTEP_SCOPE` once and append it to project-scoped paths:

```bash
SCOPE='?org=acme&project=store&workspace=sales'
curl -sS "$AWAITSTEP_API_URL/workflows$SCOPE" -H "Authorization: Bearer $AWAITSTEP_API_KEY"
```

When no scope is needed, leave `AWAITSTEP_SCOPE` empty. Adding another query
parameter when `SCOPE` is already set means `&`, not `?`.

## First request

```bash
curl -sS "$AWAITSTEP_API_URL/workflows$SCOPE" \
  -H "Authorization: Bearer $AWAITSTEP_API_KEY"
```

A paged list answer is `{ "data": [...], "nextCursor": "…" | null }` (the node
catalogs are bare arrays; see `errors.md`). `limit` is
1–100, default 50. Pass `cursor` from `nextCursor` for the next page. When
`nextCursor` is `null`, there are no more pages.

## What the API returns, and what it hides

- Responses carry only what the viewer may see. Secret values are masked and
  never returned; non-secret values are. Do not ask for a secret "to check it".
- A resource outside the key's scope, or one the user cannot open, is `404` by
  design. Do not probe other IDs to find it.
- A `403` names the missing cell (`workflows:write`, `library:read`, …) or the
  role reason. Quote it to the user.

## Limits worth knowing

| Limit                    | Value                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Request body             | 1 MB, every route, before route-specific rules                                         |
| Global                   | 200 requests/minute per IP                                                             |
| Writes                   | 30/minute per user                                                                     |
| Deploys                  | 10/minute per user                                                                     |
| Project files            | from `GET /workflows/:id/project` (`limits.maxFiles`, `maxFileBytes`, `maxTotalBytes`) |
| Library items per owner  | 200                                                                                    |
| Library versions kept    | 3                                                                                      |
| Library imports per item | 100                                                                                    |

The project limits come from the API because they are enforced there. Read them
instead of assuming the numbers in this table have not changed.

## Cloud vs self-hosted

Cloud and self-hosted run the same API. The differences that matter to an agent:

- Cloud is `app.awaitstep.dev/api`; a self-hosted instance is wherever the user
  runs it.
- Deploying needs a provider connection (Cloudflare today) set up in the
  dashboard. Without one, a deploy answers with the provider's refusal; that is
  a setup task for the user, not something to retry.
- Organization-wide marketplace nodes and variables may be installed on one
  instance and not another; read `GET /nodes` and `GET /env-vars/resolved`
  instead of assuming.
