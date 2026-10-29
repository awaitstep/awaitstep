---
title: Project Files
---

# Project Files

A workflow is a small TypeScript project. Beside the code the canvas
generates, you own files: handler modules, shared helpers, a `package.json`,
data files. This page is what a person or an agent needs to read, write and
verify them over the API.

Every path below is relative to your instance's API root — `https://app.awaitstep.dev/api`
on the cloud, or `http://localhost:8080/api` self-hosted — and every request
carries `?projectId=<id>` and `Authorization: Bearer ask_…`. The exhaustive
per-endpoint reference lives in [REST API](/api/rest).

## Permissions

An API key carries a grid of permissions, and a missing cell is the first
thing to go wrong. Project files are workflow work, so every call here needs
a cell of the `workflows` resource — on a project key or a workspace key
(an organization key never reaches a workflow):

| Cell               | What it covers                                                 |
| ------------------ | -------------------------------------------------------------- |
| `workflows:read`   | Reading the tree and any file, and **`POST /source/check`**    |
| `workflows:write`  | `PUT` on files, `convert-handlers`, starting a test session    |
| `workflows:delete` | `DELETE` on files                                              |
| `workflows:run`    | Triggering and stopping a test session, `trigger`, run control |
| `workflows:deploy` | `deploy`, `takedown`                                           |

So a key that only reads can still answer "is this workflow healthy?" — but
creating a file needs `workflows:write`, and running one `workflows:run`.
A workspace key sees only its own workspace's workflows; one elsewhere in
the project is `404`.

## The rules come from the API, not from this page

`GET /workflows/:id/project` returns the file tree **and the conventions
that govern it**: where you may write, how imports resolve, which extensions
are accepted, and the size limits.

```bash
curl -s "$API/workflows/$WF/project?projectId=$P" -H "Authorization: Bearer $KEY"
```

```json
{
  "importPrefix": "#app/",
  "generated": ["worker.*", "nodes/**", "wrangler.*"],
  "rootConfigFiles": ["package.json", "tsconfig.json", "jsconfig.json"],
  "extensions": ["ts", "mts", "cts", "js", "mjs", "cjs", "json", "md", "…"],
  "limits": { "maxFiles": 100, "maxFileBytes": 512000, "maxTotalBytes": 2000000 },
  "files": [{ "path": "lib/retry.ts", "hash": "…", "size": 42, "updatedAt": "…" }]
}
```

**Read those values from the response rather than hard-coding what you see
here.** They are the same values the server enforces, so a limit that
changes changes in one place. The numbers printed above are an illustration,
not a contract.

Two rules are worth stating in prose because they explain refusals you will
otherwise find by trial:

- **`generated` paths are not yours.** The canvas rewrites them on every
  save. Writing one is refused; put your code in a file of your own and
  import it.
- **Paths must not collide after compile.** `lib/a.ts` and `lib/a.js` become
  the same file, and so do `Env.ts` and `env.ts` on a case-insensitive disk.
  Either is refused with the name it would have overwritten.

## Reading and writing one file

```bash
# Read it — the ETag is the content hash
curl -si "$API/workflows/$WF/files/lib/retry.ts?projectId=$P" -H "Authorization: Bearer $KEY"

# Create it, and only if it does not exist yet
curl -s -X PUT "$API/workflows/$WF/files/lib/retry.ts?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' \
  -d '{"source":"export const retry = 3\n"}'

# Replace it, and only if nobody changed it since you read it
curl -s -X PUT "$API/workflows/$WF/files/lib/retry.ts?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -H 'If-Match: "<hash from the ETag>"' \
  -d '{"source":"export const retry = 5\n"}'
```

`201` created, `200` replaced, `204` deleted. A precondition that does not
hold is a `409` carrying `currentHash`, so you can re-read and retry rather
than guess.

:::tip
Send `If-Match` whenever you are changing a file you read earlier. A person
editing in the browser and an agent writing over the API are two writers; the
header is what stops the later one silently discarding the other's work.
:::

Writes take effect on the next deploy. They do not create a new version, so a
file edit is not a canvas save.

## Importing your files

Any file can import any other with the prefix `GET /project` reports as
`importPrefix` — `#app/`, rooted at the project:

```ts
// handlers/fetch.ts
import { retry } from '#app/lib/retry'
```

It resolves the same from a handler, from a generated step module, and from
another file of yours. Extensionless specifiers find `.ts` and `.js`; JSON
needs its extension (`#app/data/countries.json`). Relative imports work too,
but `#app/` does not change meaning when a file moves.

Imports must stay inside the project. A relative import that climbs above
the project root (`'../../config.json'` from a top-level file) or an
absolute one (`'/etc/…'`) would have the bundler pick up a file from the
machine doing the build, so deploys, test sessions and local runs refuse it
with a `422` naming the file and specifier, and `source/check` reports it.
The scan is deliberately blunt — it reads the raw source, so the same
specifier inside a comment or a string is reported too.

A step on the canvas can import your code the same way, which is the usual
reason to create a file at all:

```ts
import { retry } from '#app/lib/retry'
return { attempts: retry }
```

## Handler modules

What starts a workflow is part of the workflow definition; the code that runs
when it starts is a file you own, under `handlers/`:

| File                             | Runs on                         |
| -------------------------------- | ------------------------------- |
| `handlers/fetch.ts`              | an HTTP request                 |
| `handlers/scheduled.ts`          | a cron trigger                  |
| `handlers/queue/<queue-name>.ts` | a message on that queue         |
| `handlers/shared.ts`             | nothing — code the others share |

Each exports a default function. The filename is the only thing the deploy
reads from it, so `handlers/queue/orders.ts` consumes the `orders` queue; the
queue binding and cron expressions stay in the workflow definition.

One file per entry. A second file for the same entry is refused — including a
different extension for the same name — because nothing would say which one
runs:

```
Invalid handler path "handlers/fetch.mjs": would be a second fetch handler
beside "handlers/fetch.ts" — one file per entry
```

A name that only looks like an entry is refused too, because it would never
run:

```
Invalid handler path "handlers/Fetch.ts": would never run — did you mean handlers/fetch.ts?
```

If the real `handlers/fetch.ts` is already there, that same write is refused
one step earlier as a compile collision (`Fetch.ts` and `fetch.ts` become the
same file) — a different message for the same mistake.

:::warning
Older workflows carry a single annotated `handlers.ts` instead. It and the
`handlers/` folder are two models of the same thing and never coexist: while
`handlers.ts` is present, writing a handler module is refused. Convert first
with `POST /workflows/:id/project/convert-handlers`, which splits it into
modules in one request, or delete it.
:::

## Checking your work

`POST /workflows/:id/source/check` answers the question worth asking after
every write — _did that work?_ — without returning the code:

```bash
curl -s -X POST "$API/workflows/$WF/source/check?projectId=$P" -H "Authorization: Bearer $KEY"
```

```json
{
  "ok": false,
  "versionId": "v_2b…",
  "checked": ["ir", "provider", "env", "compile", "import"],
  "diagnostics": [
    {
      "source": "import",
      "path": "handlers/fetch.ts",
      "message": "Cannot resolve \"#app/lib/retyr\" — no project file matches it"
    }
  ]
}
```

`checked` is what actually ran, so an empty `diagnostics` means "nothing
found **by these checks**". There is no type check yet, and `checked` never
claims one. `ok: false` is an answer, not an error: a cycle in the graph, a
file that will not parse and a missing secret are all `200`. A non-2xx means
the check could not run at all.

A `read` key is enough, which makes it cheap to call in a loop.

### Checking files you have not written yet

Send candidates and they are judged in memory and discarded — nothing is
stored:

```bash
curl -s -X POST "$API/workflows/$WF/source/check?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"files":[
        {"path":"lib/retry.ts","source":"export const retry = 3\n"},
        {"path":"lib/old.ts","source":null}
      ]}'
```

`source: null` asks what _deleting_ a file would break, which is the edit
most likely to orphan an import. The set is judged together, so two files
that are only valid as a pair pass as a pair. The rules are the ones the
matching write would apply, so a candidate the save path refuses is refused
here too — with the same reason, as a `422`.

This is how to avoid publishing a broken intermediate state: ask first, write
once.

## Generated files

The canvas owns `worker.ts`, `nodes/*` and `wrangler.*`: they are generated
from the graph on every read and every deploy, so a write to one is refused
and an edit would be overwritten regardless. Your own files live in the
project, which is everything above — put the code there and import it with
`#app/`.

The whole generated bundle is readable at any time through
`GET /workflows/:id/source`, project files folded in, which is what the code
workspace shows.

## A complete pass

Create a file, import it from a handler, check it, and deploy — with a key
holding `workflows:write` and `workflows:run` (the Deploy & run preset plus
write does):

```bash
# 1. A helper of your own
curl -s -X PUT "$API/workflows/$WF/files/lib/greeting.ts?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' \
  -d '{"source":"export const greeting = \"hello\"\n"}'

# 2. A fetch handler that imports it
curl -s -X PUT "$API/workflows/$WF/files/handlers/fetch.ts?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"source":"import { greeting } from \"#app/lib/greeting\"\nexport default async function (request, env) {\n  return new Response(greeting)\n}\n"}'

# 3. Did that work?
curl -s -X POST "$API/workflows/$WF/source/check?projectId=$P" -H "Authorization: Bearer $KEY"
# → {"ok":true,...,"diagnostics":[]}

# 4. Run it without deploying: a test session (workflows:write to start it)
curl -s -X POST "$API/workflows/$WF/test-sessions?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}'
# → {"session":{"id":"c6Vg…","runtime":"node","status":"running",…},"reused":false}

# Send it a request (workflows:run). `payload` is optional and becomes the trigger input.
curl -s -X POST "$API/test-sessions/$SESSION_ID/trigger?projectId=$P" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"payload":{"name":"world"}}'

# Done with it
curl -s -X DELETE "$API/test-sessions/$SESSION_ID?projectId=$P" -H "Authorization: Bearer $KEY"

# 5. Or deploy it for real (workflows:deploy)
curl -s -X POST "$API/workflows/$WF/deploy?projectId=$P" \
  -H "Authorization: Bearer $KEY_WITH_DEPLOY" -H 'Content-Type: application/json' -d '{}'
```

A second `POST /test-sessions` for the same workflow **reuses** the live one
rather than refusing (`"reused": true`, status `200`), so a retry is safe.
Sessions are reaped on a timer, which is why deleting one when you are done
is a courtesy rather than a requirement.

Step 3 is the one to repeat. Everything else is cheap to get wrong once;
shipping a broken file is not.

## Limits worth knowing before you hit them

The per-file and per-project limits come from `GET /project`. One more does
not, because it is not about files: **no API request body may exceed 1 MB**,
whatever the project total allows. A larger request is rejected with `413`
before any of the file rules are considered, so a project is built up over
several writes, and a single file close to the per-file limit travels alone.
