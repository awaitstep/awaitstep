# Environment variables

Code reads configuration and secrets by name: a step as `env.NAME`, a custom
node template as `ctx.env.NAME`. Values never go in the IR, a node's data, a
project file or a chat message.

## Two layers

- **The workflow's own variables** are what the deployed worker gets, and the
  only ones it gets. Each holds a literal value or a reference,
  `{{global.env.NAME}}`. On Cloudflare a name ending in `_BINDING_ID` is kept
  for the provider and never reaches the code.
- **Shared variables** belong to the organization, a project or a workspace
  (`/env-vars`). A reference resolves at deploy: the workflow's workspace first,
  then its project, then the organization. A shared variable a workflow does not
  reference is not in its worker.

So a step that reads `env.WEATHER_API_KEY` needs a workflow variable named
`WEATHER_API_KEY`, usually holding `{{global.env.WEATHER_API_KEY}}`.

## What is checked

- A custom or marketplace node's `secret` field names an `envVarName`. That
  name must be one of the workflow's variables.
- Every reference must resolve to a shared variable.

Both show in `POST /workflows/$WF/source/check` as a diagnostic with
`source: "env"`, such as `Missing or unresolved environment variables: A, B`. A
deploy refuses the same workflow with `400`.

**A step's own `env.NAME` reads are not checked.** A missing one is `undefined`
at run time. List the names the code reads yourself, and compare them with the
workflow's variables.

## Read them

```bash
# The workflow's own: `envVars` is a JSON string, secret values masked
curl -sS "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH" | jq -r '.envVars'

# What its workspace supplies: each name once, the closest level winning (variables:read)
WS=$(curl -sS "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH" | jq -r '.workspaceId')
curl -sS "$AWAITSTEP_API_URL/env-vars/resolved?org=<org>&project=<project>&workspaceId=$WS" -H "$AUTH"
```

- A key that reaches one project needs only `?workspaceId=$WS`.
- Read it at the **workflow's own workspace**. Without a workspace it is the
  project's view, which can list a name that does not reach this workspace
  (a variable can be limited to some workspaces) and misses the workspace's
  own values. A key pinned to one workspace needs no address.
- An organization address answers `400`. A secret value always comes back as
  `••••••••`.
- `source/check` is the final word on what resolves; this list explains it.

## Add a reference to a workflow

A reference holds no value itself, but it hands the shared variable's value,
secret or not, to this workflow's code. Add only the names the code reads, and
ask the user first when the shared variable is a secret (`isSecret` in
`/env-vars/resolved`). Then (`workflows:write`):

```bash
NAME=WEATHER_API_KEY
BASE=$(curl -sS "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH" | jq -r '.envVars // ""')
# Stop if $NAME is already in BASE: it has a value or reference; ask before replacing it.
# Otherwise this adds it (filtering by name keeps a retry from adding a duplicate, a 400)
VARS=$(jq -c --arg n "$NAME" \
  'map(select(.name != $n)) + [{name: $n, value: "{{global.env.\($n)}}"}]' <<<"${BASE:-[]}")

curl -sS -X PATCH "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --argjson vars "$VARS" --arg base "$BASE" '{envVars: $vars, envVarsBase: $base}')"
```

- `envVars` **replaces the whole list**. Send every variable you read back,
  including each masked secret exactly as it came: the mask keeps the stored
  value.
- `envVarsBase` is the `envVars` string exactly as you read it, or `""` when
  it read `null` (no variables yet). `409` means someone changed the variables
  meanwhile: re-read and ask.
- Names start with an uppercase letter, then uppercase letters, digits and
  underscores. A name starting with `SECRET_` must have `"isSecret": true`; an
  old variable stored with that prefix but no flag needs `"isSecret": true`
  added before the list is sent back, or the write answers `400`.
- A reference takes its secrecy from the shared variable it names when it is
  resolved; the workflow's own row still shows `isSecret: false` for it.
- The change applies on the next deploy or test session.

## Shared variables are the user's

Setting a value, above all a secret, is the user's call. The value should never
pass through you:

- Tell the user which names are missing and at which level they belong (the
  project for every workspace, a workspace for one). They set them in the
  dashboard under the project's or workspace's variables.
- Never ask the user to paste a secret into the chat, and never put one in a
  command line.

When the user explicitly asks you to set a **non-secret** shared value they gave
you, address the level in the query, not the body:

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/env-vars$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"name":"REGION","value":"eu-west-1"}'
# 201 the variable; 409 the name is already set at that level
```

- Needs `variables:write` (`variables:delete` for `DELETE /env-vars/:id`), and
  the key's owner must be an admin of that level, or the answer is `403`.
- `PATCH /env-vars/:id` changes `name`, `value` or `isSecret`; any other field
  is ignored. Turning a secret into a plain variable needs a new value (`422`).
- A `POST` body naming `projectId` or `workspaceId` is refused with `400`; the
  query says where.
