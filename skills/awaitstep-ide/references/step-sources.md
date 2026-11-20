# `steps/<id>.ts` is the graph

Code mode shows each step node as a file under `steps/`, named after the node.
It looks like a project file and is not one.

## What it is

- The file's content is the node's `data.code` — the step module.
- It has no row in the project-file table, so it has no content hash of its own
  and does not appear in `GET /files`.
- The generated bundle emits each step at its own path; the Code view merges the
  two and lets you edit the step there. Saving it writes a **version**, not a
  file.
- The path is reserved: `PUT /workflows/:id/files/steps/<id>.ts` is refused with
  "is step code; edit the step under steps/ or on the canvas".

## How to change one

Save a version with the step's code:

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/full$SCOPE" -H "$AUTH" \
  | jq -r '.version.ir' | jq . > ir.json
# edit nodes[<the step>].data.code
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/versions$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "$(jq -c --arg base "$GRAPH_HASH" '{ir: ., baseGraphHash: $base}' ir.json)"
```

The module's function name must equal the step's variable name (the sanitized
display name, case preserved). `400` says which name is expected.

## How it differs from a file save

| A project file write                             | A step save                            |
| ------------------------------------------------ | -------------------------------------- |
| `PUT /files/<path>`                              | `POST /versions` (or the IDE's Save)   |
| ETag precondition                                | `baseGraphHash` precondition           |
| no version; `POST /versions/commit` snapshots it | creates/overwrites the version         |
| can be imported with `#app/`                     | is the node; referenced by expressions |
| read by a deploy on next deploy                  | read by a deploy from the version      |

The Code IDE commits a step save as part of the version write; there is no
separate commit for it.

## Older projects

A file stored under `steps/` **before** the folder was reserved remains a
project file: it has a hash, is editable as a file, and its owner is `project`.
Do not create new ones. If a path collides with a step's source, the save is
refused and names the step.

## Generated neighbours

`worker.*`, `nodes/**`, `awaitstep/**` and `wrangler.*` are generated modules,
not step sources. `GET /workflows/:id/source` returns the whole bundle with
project files folded in; `GET /workflows/:id/source/modules` lists the modules
(it needs `library:read` as well as `workflows:read`). Neither is writable.

## Why it matters to an agent

- Editing `nodes/<var>.ts` or `worker.ts` is always wrong, even though it looks
  like the same code.
- Editing `steps/<id>.ts` with the files API also fails; the fix is a version
  save.
- In a report, say "saved a version with the step code changed", not "edited
  `steps/x.ts`".
