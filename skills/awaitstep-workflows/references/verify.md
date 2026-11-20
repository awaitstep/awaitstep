# Verify a workflow

The order is: save → check → test session → deploy (only when asked) → runs.
Each step is cheaper than the next; do not skip to the expensive one.

## 1. Check (`workflows:read`)

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" -H "$AUTH"
```

```json
{
  "ok": false,
  "versionId": "v_…",
  "checked": ["ir", "library", "provider", "env", "compile", "import"],
  "diagnostics": [
    { "source": "import", "path": "handlers/fetch.ts", "message": "Cannot resolve …" }
  ]
}
```

- `ok: false` is a `200` and an answer, not a server error. Read every
  diagnostic.
- `checked` is what actually ran. There is **no type check** in it; say so when
  you report "checked".
- `source` names the layer: `ir` (the graph), `library` (a module or custom
  node), `provider` (the target), `env` (declared variables/resources),
  `compile` (codegen), `import` (project files).

To test edits before writing them, send candidates; they are judged together in
memory and discarded:

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"files":[
    {"path":"lib/retry.ts","source":"export const retry = 3\n"},
    {"path":"lib/old.ts","source":null}
  ]}'
```

`source: null` asks what deleting that file would break. This is the way to
avoid publishing a broken intermediate state: ask first, write once.

## 2. Test session (`workflows:write` to start, `workflows:run` to trigger)

A test session runs the entry in a local runtime; no deploy, no Cloudflare
account. It runs the real code with the project's variables and secrets, so its HTTP
calls and writes are real: ask the user before triggering one that charges,
sends or changes anything outside AwaitStep.

```bash
SESSION=$(curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/test-sessions$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{}' | jq -r '.session.id')
# 201 { "session": { "id": "…", "status": "running", … }, "reused": false }
# 200 { "session": { … }, "reused": true }   ← a session is already live

INSTANCE=$(curl -sS -X POST "$AWAITSTEP_API_URL/test-sessions/$SESSION/trigger$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"payload":{"orderId":"ord_1"}}' | jq -r '.body.instanceId')
# the answer: 200 { "status": 200, "body": { "instanceId": "…" } }

curl -sS -N --max-time 30 \
  "$AWAITSTEP_API_URL/test-sessions/$SESSION/stream?instanceId=$INSTANCE" -H "$AUTH"
curl -sS -X DELETE "$AWAITSTEP_API_URL/test-sessions/$SESSION$SCOPE" -H "$AUTH"
```

- The trigger body is `{ "payload": … }`; it becomes `event.payload`. The
  answer wraps the handler's reply: for a workflow, `body.instanceId` names the
  run.
- The stream is Server-Sent Events and stays open; give curl `--max-time`.
  - `logs`: `{ entries, cursor }`, the runtime's console output, so a
    `console.log` in a step shows here. The runtime also logs a `GET / 200`
    line about every second; skip those. A run's last logs can arrive a few
    seconds after its `complete` event, so read to the end of `--max-time`.
  - `instance`: the status of the instance named by `?instanceId=`, sent each
    time it changes. When it ends it reads
    `{ "status": "complete", "output": …, "__LOCAL_DEV_STEP_OUTPUTS": [ … ] }`,
    or the error when it failed.
    - `output` is the workflow's return value. A graph workflow returns
      nothing, so it is `null`.
    - `__LOCAL_DEV_STEP_OUTPUTS` has one entry per durable step that ran, in
      order, not one per node. A run of plain steps in a straight line (no
      retry or timeout settings) is grouped into one durable step. A
      durable HTTP Request is one too; sleep, branch and a non-durable HTTP
      Request have no entry.
    - An entry keeps only what later nodes read: a group's entry holds those
      values by node name (`{ "validate_order": { … } }`), a single step's
      its value. Anything nothing reads is `null`, so a chain of steps that
      only feed each other shows `[null]`. A loop records each body run, then
      its own entry (the last body value): two items give three entries.
    - The `flow.step("<name> (<id>)", …)` calls in `awaitstep/workflow.ts`
      (`GET /workflows/$WF/source`) show the grouping. To check one node's
      value, `console.log` it and read the `logs` event.
    - This is the only record of a test run: it never appears under
      `GET /workflows/$WF/runs`.
  - `closed` with `final: true`: the session ended.
  - curl exits `28` when `--max-time` ends the stream. That is the normal end,
    not a failure; read the events you got.
- The session has no saved version? `400`. Save first.
- Start the session again after a save or a file write. A start hands back the
  live session (`reused: true`) only when it runs the code that would be built
  now: same version, files, modules, variables, dependencies and workflow
  name. Otherwise the old session is stopped and a new one starts
  (`reused: false`, `201`).
- A key acts as the person who made it, and each person may have one live
  session (the instance default), across every workflow, dashboard included.
  Starting another answers `409 "You already have a test session running —
stop it before starting another"`. That session may be the user's own
  dashboard session, or one you started earlier: ask before stopping one
  you did not start. `GET /workflows/:id/test-sessions`
  (`{ "session": { "id", … } | null }`) shows only that workflow's session;
  `DELETE /test-sessions/:id` stops one. If you cannot find it, ask the user to
  stop it in the dashboard. An idle session is also stopped after about ten
  minutes.
- Other start refusals: `409 "…Start it again."` or `409 "Could not start a
test session — try again"` mean another start overlapped; start once more.
  `409 "Test session was stopped while starting"` means someone stopped it.
  `429` means the instance or project cap is full and frees up with time;
  `503` means test sessions are switched off.
- The other `/test-sessions/:id/…` reads are the dashboard's: a key gets `403
"This endpoint is not available to API keys"`. That is not a missing cell.
- Delete the session when done; sessions are also reaped.

## 3. Deploy (`workflows:deploy`) — only when the user asks

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/deploy-connections$SCOPE" -H "$AUTH"
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/deploy$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"connectionId":"<connection id>","versionId":"<optional>"}'
```

- A deploy needs a saved version and a provider connection. Read
  `deploy-connections` first: an empty `connections` list means the user must
  add one in the dashboard. Say that instead of calling deploy; a body without
  `connectionId` is only a `422 Validation failed`.
- `200 { "success": true, "deploymentId": "…", "id": "…" }` is the only answer
  that means live.
- `500 { "success": false, "error": "…" }` is a failed deploy; report the error.
- `409 { "cancelled": true }` means it was cancelled before upload.
- This creates a real Worker and costs the user money. Ask first.

`POST /workflows/$WF/deploy-stream` is the same request with SSE progress.

## 4. Runs

After a deploy:

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs$SCOPE" -H "$AUTH"
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN$SCOPE" -H "$AUTH"
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/steps$SCOPE" -H "$AUTH"
```

Run states include `queued`, `running`, `paused`, `complete`, `errored` and
`terminated`. A run can be paused, resumed or terminated (`workflows:run`);
those are side effects, so ask.

To start a real instance of a deployed workflow from a key:

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/run/$WF" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_1"}'
# → 201 { "runId": "run_…", "instanceId": "…", "status": "queued" }
```

The body is the run's params, capped at 100 KB, and becomes `event.payload`.
`?account=<connection id>` names the account; without it, the newest live
deploy's. Every call is recorded as a run. `POST /workflows/$WF/trigger` is
session-only and answers `403` for an API key.

## What to report

- The workflow id, version id and `graphHash`.
- The check result: `ok`, and `checked` (do not call it a type check).
- If a test session ran: its status and the trigger result.
- If a deploy ran: `success`, `deploymentId` or the error.
- What is still the user's to do (Deploy, publish a module, set an env var).
