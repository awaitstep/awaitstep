# Verify from the IDE

Code mode has one extra state to settle — live project files versus the version
they belong to — before the usual check, test and deploy.

## 1. Finish the writes

- Every write sends `If-Match`/`If-None-Match`; a `409` stops you.
- After a batch, `POST /workflows/$WF/versions/commit` so the version carries
  the files. `404` means the workflow has no version: save the graph first.
- Do not commit after every single file if a group is still in progress; commit
  once the group is coherent.

## 2. Check candidates before writing

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"files":[
    {"path":"lib/retry.ts","source":"export const retry = 5\n"},
    {"path":"lib/old.ts","source":null}
  ]}'
```

The set is judged together in memory and discarded. A candidate that the write
path would refuse is `422` with the same reason. Use this for a risky edit, a
delete, or a pair of files that are only valid together.

## 3. Check the project

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" -H "$AUTH"
```

- `diagnostics[].source` names `ir`, `library`, `provider`, `env`, `compile` or
  `import`; `path` names the file where one applies.
- `ok: false` is a `200` answer, not a server error.
- `checked` says what ran. There is no type check; do not claim one.

## 4. Test session

It runs the real code with the project's variables and secrets, so its HTTP
calls and writes are real: ask the user before triggering one that charges,
sends or changes anything outside AwaitStep.

```bash
SESSION=$(curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/test-sessions$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{}' | jq -r '.session.id')
curl -sS -X POST "$AWAITSTEP_API_URL/test-sessions/$SESSION/trigger$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{"payload":{}}'
curl -sS -N --max-time 30 "$AWAITSTEP_API_URL/test-sessions/$SESSION/stream$SCOPE" -H "$AUTH"
curl -sS -X DELETE "$AWAITSTEP_API_URL/test-sessions/$SESSION$SCOPE" -H "$AUTH"
```

A session runs the entry (the fetch handler) locally. It needs a saved version;
`400` means none. **After a file write or a save, start the session again**: the
live one is handed back (`reused: true`) only while it runs the current code,
and replaced otherwise. What the run returned and logged is in
the trigger's answer and the stream; the workflow skill's verify reference
(step 2) lists the stream's events.

## 5. Deploy — only when asked

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/deploy-connections$SCOPE" -H "$AUTH"
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/deploy$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"connectionId":"<id>"}'
```

A deploy reads the live project files, so a commit is not required for it — but
the version is what history and rollback carry. Report `success` and the
deployment name, or the error; never infer a deploy.

## What to report

- Files created/changed/deleted, by path.
- Whether the files were committed into the version, and the version id.
- The check result and its `checked` list.
- The test session result, if one ran.
- The deploy result, if the user asked for one.
- Anything still theirs: set an env var, add a dependency, deploy.
