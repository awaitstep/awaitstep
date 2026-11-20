# Project files

A workflow's project is a small TypeScript program rooted at `#app/`. Files you
create live in the project table; generated modules and Library code do not.

## Paths

`GET /workflows/:id/project` reports the conventions; they are enforced on
write:

- **Safe segments** — letters, digits, `_`, `.`, `-`; no dotfiles, no `..`, no
  absolute paths, no traversal. Send the plain path: curl and most HTTP
  clients resolve `lib/../x.ts` to `x.ts` before sending, so it writes `x.ts`.
- **Extensions** — the list in `extensions` (`.ts`, `.mts`, `.cts`, `.js`,
  `.mjs`, `.cjs`, `.json`, `.md`, and the rest).
- **Root config files only at the root** — `package.json`, `tsconfig.json`,
  `jsconfig.json`. A nested one changes resolution and is refused.
- **No collisions after compile** — `lib/a.ts` and `lib/a.js` are one file; so
  are `Env.ts` and `env.ts` on a case-insensitive disk. Refused with the path it
  would overwrite.
- **No generated or reserved paths** — `worker.*`, `nodes/**`, `awaitstep/**`,
  `modules/**`, `wrangler.*`; and `steps/**`, which is the graph.
- **Limits** — `limits.maxFiles`, `maxFileBytes`, `maxTotalBytes` from
  `GET /project`; no request body over 1 MB.

Folders are implied by paths; there is no folder row. Creating `lib/a/b.ts`
creates the folder in the tree. Deleting the last file removes it.

## The ETag contract

`GET /files/:path` answers the file plus an `ETag` equal to its content hash.

| Write header         | Meaning                   | Failure                     |
| -------------------- | ------------------------- | --------------------------- |
| `If-Match: "<hash>"` | replace only this version | `409` with `currentHash`    |
| `If-None-Match: *`   | create only               | `409` "File already exists" |

- Send `If-Match` whenever you changed a file you read. Two writers (the user's
  editor and the agent) otherwise silently discard one.
- A `409` is a person, not a bug: re-read, diff, ask.
- `DELETE` takes `If-Match`; `204` on success.
- A refused write changes nothing.

## Imports

```ts
import { retry } from '#app/lib/retry'
import data from '#app/data/countries.json'
import { scoreLead } from '#modules/lead-scoring'
```

- `#app/` is rooted at the project and works from a handler, a step module or
  another project file.
- Extensionless resolves `.ts`/`.js`; JSON needs its extension.
- Relative imports work but must stay inside the project. A file importing
  `../../config.json` from a top-level file, or an absolute path, still saves;
  `source/check` reports it (`source: "import"`), and a test session or deploy
  is refused with `422` until it is fixed.
- The import scan is textual: the same specifier inside a comment or string is
  reported too. Keep it clean.
- Library modules are read-only and always the latest published version. Do not
  write under `modules/`.

## Virtual seeds

An older project may show `handlers.ts` and/or `package.json` in Code without a
real stored file: they are the legacy `triggerCode`/`dependencies` settings
surfaced for adoption. Saving one creates the real file, which the server then
prefers. A project on handler modules no longer shows `handlers.ts`.

## Read-only views

- `GET /workflows/:id/full?version=<id>` and `GET /source?versionId=<id>` read
  an older version; its files are not writable.
- A Viewer role sees files without write access.
- Library files in the bundle are marked read-only; change them in the Library
  and publish.

## Commit

A file write does not create a version. `POST /workflows/:id/versions/commit`
snapshots the live files into the current version: `200` in place, `201` next
version (if the current one deployed), `404` when there is no version. The graph
does not move. Commit after a batch so rollback and history carry the files;
deploy reads the live files either way.
