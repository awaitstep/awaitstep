# Module files

A module is a small package. The deploy folds it into the consumer at
`modules/<slug>/`, so every path is relative to the module root.

## The layout

```
package.json        required, at the root; holds name, version, dependencies
index.ts            the entry `#modules/<slug>` resolves to
scoring.ts          any other code, imported relatively or as a subpath
data/countries.json a JSON file (import it with its extension)
```

Rules enforced on write and check:

- **`package.json` at the root only.** A nested one is refused.
- **Paths are relative and safe.** No `..`, no absolute paths, no
  `node_modules`, no toolchain files (`tsconfig.json`, `wrangler.*`, …).
- **Extensions** are the project's code/data set: `.ts`, `.mts`, `.cts`, `.js`,
  `.mjs`, `.cjs`, `.json`, `.md` and the rest of the extension list in
  `GET /project`.
- **Case collisions** (`Scoring.ts` vs `scoring.ts`) are refused: they become
  one file at deploy.
- **Size** — per-file and total limits are in `GET
/library/items/:id/project` (`limits`); the request body cap is 1 MB.

## Writes

Read a file, keep its ETag, and send it back as `If-Match`:

```bash
curl -si "$AWAITSTEP_API_URL/library/items/$ITEM/files/index.ts$SCOPE" -H "$AUTH"
# ETag: "abc123"

curl -sS -X PUT "$AWAITSTEP_API_URL/library/items/$ITEM/files/index.ts$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -H 'If-Match: "abc123"' -d '{"source":"…"}'
```

- `If-None-Match: *` means "create only"; a second writer gets `409`.
- Omitting the precondition is last-writer-wins. Do not do that when the user
  may be editing in the Library IDE.
- A `409` carries `currentHash`; re-read and ask.
- `DELETE` takes `If-Match`; `204` on success.

A node's published version folder is read-only; a module's published versions
are history (read them through `/versions`, not as files).

## Imports

- **Inside the module:** relative (`./scoring`) or `#modules/<slug>` for other
  modules.
- **JSON:** include the extension (`./data/countries.json`).
- **No external path escapes.** An import that climbs above the module root or
  is absolute is refused at check/publish.
- **`#modules/<slug>` resolves by owner.** A workspace module takes its own
  first, then the project's; a project module resolves only to the project's.
  The item's own slug is never one of its imports.

## Dependencies

`package.json`:

```json
{
  "name": "lead-scoring",
  "version": "1.0.0",
  "type": "module",
  "dependencies": { "zod": "4.0.0" }
}
```

- The consumer's deploy merges the module's dependencies. Two modules (or a
  module and the project) declaring different versions of one package is a
  deploy error naming both.
- Dependencies are installed at deploy; they are not available while you edit
  the file in the Library IDE.
- Declare every npm package you import in `package.json`; the deploy installs
  from there. The check does not verify bare package names for you.

## What a consumer sees

- The **latest published** version, never the working copy.
- The files at `modules/<slug>/…` in the bundle, read-only in the consumer's
  Code view.
- Its own env and bindings, not the module's: a module is code, not a runtime.

## Limits

- 200 items per owner (workspace or project).
- 100 module imports per item.
- 3 published versions kept.
- Project file limits from `GET /project`: `maxFiles`, `maxFileBytes`,
  `maxTotalBytes`; request bodies cap at 1 MB.
