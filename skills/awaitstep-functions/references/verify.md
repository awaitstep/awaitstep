# Verify a Function

A Function is checked and saved like a workflow. What differs is how you run it
and what the response means.

## 1. Save

`POST /workflows/:id/versions` with `{ "ir": …, "baseGraphHash": "…" }` (omit
the hash for the first save). `400` lists the IR problems; `409` means the graph
moved. Both are handled as in `awaitstep-workflows`.

## 2. Check

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" -H "$AUTH"
```

Read `ok`, `checked` and each diagnostic. A missing export is not a diagnostic:
the response will simply not carry that key.

## 3. Test session

A test session starts the Function's `fetch` handler locally; no deploy. It runs the real code with the project's variables and secrets, so its HTTP
calls and writes are real: ask the user before triggering one that charges,
sends or changes anything outside AwaitStep.

```bash
SESSION=$(curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/test-sessions$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{}' | jq -r '.session.id')
# → 201 { "session": { "id": "…", "status": "running" }, "reused": false }

curl -sS -X POST "$AWAITSTEP_API_URL/test-sessions/$SESSION/trigger$SCOPE" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"payload":{"orderId":"ord_1"}}'
```

The trigger body is `{ "payload": … }`; the handler sees it as
`event.payload`. The answer is `{ "status": …, "body": … }`: the Function's own
response, so `body` holds the exported values. That answer is the result; a
test call never appears under `/runs`. The default handler POSTs only; a GET
returns `200` with an empty body.

Start the session again after a save or a file write: the live one is handed
back (`reused: true`) only while it runs the current code, and replaced
otherwise. Delete it when done (`DELETE /test-sessions/$SESSION`).

## 4. Deploy

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/deploy-connections$SCOPE" -H "$AUTH"
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/deploy$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"connectionId":"<connection id>"}'
```

Only `success: true` means live. A Function deploys a fetch Worker; there is no
durable Workflow instance, but each call is recorded as a run and listed under
Runs.

## 5. Invoke it

From an API key, **`POST /run/:workflowId`** is the recorded path. The body is
sent on as-is (bytes, with its `Content-Type`; JSON when none), the answer is
the Function's own status, `Content-Type` and body, and the run id is in
`X-AwaitStep-Run-Id`. A redirect's target comes as
`X-AwaitStep-Function-Location`, never `Location`.

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/run/$WF" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_1"}'
```

- The body becomes `event.payload`; a body that is not JSON arrives as
  `undefined` (the default handler catches the parse failure).
- The response is your handler's; the default is
  `Response.json(graph)` of exported nodes.
- A thrown step becomes `{ "message": "…" }` with status `500` in the default
  handler.
- A deploy with only a route has no `workers.dev` address to call, so `/run`
  answers `400`; a route or custom domain is public and calls there are not
  recorded. The Worker URL is never returned by the API.
- `POST /workflows/:id/trigger` is session-only and refuses a key with `403`.

## What passing means

- `source/check` found no structural, import, provider or environment problem.
  It is not a type check.
- A test session returned a response; check the body, not just the status.
- A deploy said `success: true`; the Worker answers at the reported name.

Report the Function id, version id, check result, the response you saw, and
whether it is deployed, and the run id when `/run` answered. A Function has no
trigger of its own; never call the deployment a trigger.
