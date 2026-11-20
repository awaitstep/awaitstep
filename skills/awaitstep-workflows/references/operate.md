# Operate a deployed workflow

Everything here changes something outside the graph: a live worker, a running
instance or the workflow itself. Do none of it until the user asks, and report
the response, not what you expected.

Start every task here with `GET /workflows/$WF/full`. Its `liveDeployments`
lists one row per account the workflow is live on: `id` is the connection id
the calls below take, `version` the version that account runs.

## Triggers

A deployed workflow starts in one of three ways.

| Trigger            | Where it is set                                                               |
| ------------------ | ----------------------------------------------------------------------------- |
| An API key         | `POST /run/:workflowId` (`workflows:run`); see the main skill                 |
| A cron schedule    | the deploy configuration of each account (`cronTriggers`), below              |
| An HTTP or a queue | a handler module (`handlers/fetch.ts`, `handlers/queue/<name>.ts`) in the IDE |

There is no trigger block in the IR. Handler modules are project files; see
`awaitstep-ide` ([handlers](https://docs.awaitstep.dev/skills/awaitstep-ide/references/handlers.md)).

### Cron schedules

The schedule belongs to one account's deploy configuration, so read it first:

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/deploy-config/$CONN$SCOPE" -H "$AUTH"
# 200 { "config": { …, "cronTriggers": ["0 */6 * * *"] }, "defaults": {…}, "provider": "cloudflare", "preview": {…}, "uiSchema": […] }
```

Write it back with only the fields you change; the API merges them into the
stored config (`bindings` are merged by name):

```bash
curl -sS -X PUT "$AWAITSTEP_API_URL/workflows/$WF/deploy-config/$CONN$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"config":{"cronTriggers":["0 */6 * * *"]}}'
```

- Needs `workflows:deploy`. `422` carries the schema problems.
- `"cronTriggers": []` removes every schedule.
- The schedule takes effect on the **next deploy** to that account. Say so.
- What runs on each tick is `handlers/scheduled.ts`; its `cron` tells the
  schedules apart.

## Runs

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs$SCOPE" -H "$AUTH"
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN$SCOPE" -H "$AUTH"
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/steps$SCOPE" -H "$AUTH"
curl -sS -N "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/stream$SCOPE" -H "$AUTH"
```

These need `runs:read`.

To start the same run again (`workflows:run`, and ask first), send its params
alone to the account it ran on:

```bash
PARAMS=$(curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/params$SCOPE" -H "$AUTH" | jq -c '.params')
CONN=$(curl -sS "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN$SCOPE" -H "$AUTH" | jq -r '.connectionId')
# Adds ?account= or &account= after any $SCOPE
curl -sS -X POST "$AWAITSTEP_API_URL/run/$WF${SCOPE:-?}${SCOPE:+&}account=$CONN" -H "$AUTH" \
  -H 'Content-Type: application/json' -d "$PARAMS"
```

Send `.params`, not the `{ "params": … }` wrapper. When it is `null` the input
was not kept: ask the user for it instead of starting a run with none.

### Pause, resume, terminate

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/pause$SCOPE" -H "$AUTH"
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/resume$SCOPE" -H "$AUTH"
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/runs/$RUN/terminate$SCOPE" -H "$AUTH"
```

- Each needs `workflows:run` and answers `200 { "ok": true }`.
- `409` means the instance is gone from the provider, so it cannot be paused or
  resumed. A terminate still stands then: the run is recorded as terminated.
- `501` means the provider has no run control. `400 No connection` means the run
  was never started on an account (a test-session run).
- Terminate cannot be undone. Name the run and ask first.

## Roll back

There are two ways, and they differ:

- **Deploy an older version as it is.** Send its id; the editor's current
  version does not change:

  ```bash
  curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/deploy$SCOPE" -H "$AUTH" \
    -H 'Content-Type: application/json' \
    -d '{"connectionId":"<connection id>","versionId":"<version id>"}'
  ```

- An undeployed workflow usually has **one** version: a save overwrites the
  newest version until it has been deployed. There is nothing earlier to roll
  back to until a deploy freezes one.

- **Make an older version current again.** Revert copies its IR and project
  files into a new version (`workflows:write`), then deploy as usual:

  ```bash
  curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/versions/$VERSION/revert$SCOPE" -H "$AUTH"
  # 201 { "id": "…", "version": 7, …, "graphHash": "…" }
  ```

  Revert has no precondition and replaces the project files. Read `GET /full`
  first, tell the user what the current version holds, and keep the returned
  `graphHash` for the next save.

Either way, Library modules and custom nodes are **not** pinned: the deploy
takes their latest published version. Say this when a user expects a rollback
to restore library code.

## Cancel a deploy in progress

`POST /deploy-stream` sends a `started` event with the `deploymentId` first.
`GET /workflows/$WF/deployments` (`runs:read`) lists them, with each one's
status; there is no single-deployment read.

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/deployments/$DEPLOYMENT/cancel$SCOPE" -H "$AUTH"
# 202 { "status": "cancelling" }
```

- Needs `workflows:deploy`. Only when the user asks.
- `202` asks the deploy to stop; find it in the deployments list for how it
  ended.
- `409` means it is too late: the upload has started, it already finished, or
  it was interrupted. The message says which.

## Take down

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/takedown$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"connectionId":"<connection id>"}'
```

- Needs `workflows:deploy`. One account at a time: repeat it for every
  `liveDeployments` row the user wants gone.
- `404` means the workflow was never deployed with that connection. `500`
  carries the provider's error; the worker is still live then.
- The workflow, its versions and its deployment history stay.

## Rename, describe, share

```bash
curl -sS -X PATCH "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"name":"Order follow-up v2","description":"…"}'
```

- `workflows:write`. The worker is named by the workflow id, and recorded runs
  keep the name they ran under. But on Cloudflare **the next deploy names the
  Workflow after the new name**, and a Call Workflow node in another workflow
  keeps calling the old one. Before renaming a deployed workflow, tell the user
  this and find the callers (their `sub_workflow` nodes' `workflowName`).
- Node names are separate and live in the IR.
- The same `PATCH` carries the workflow's variables; see the entry skill's
  [variables reference](https://docs.awaitstep.dev/skills/awaitstep/references/variables.md).
- `PUT /workflows/$WF/share` with `{"shared": true}` (or `false`) lists the
  workflow in the project's shared library for its other workspaces, and
  answers `{ "sharing": … }`. `409` means it moved meanwhile.
- Moving a workflow to another project is a person's action in the dashboard;
  a key is refused.

## Delete

```bash
curl -sS -X DELETE "$AWAITSTEP_API_URL/workflows/$WF$SCOPE" -H "$AUTH"
```

- Needs `workflows:delete`. It stops every test session of the workflow.
- **It does not take the worker down.** A deployed workflow keeps running on its
  account. Take down each `liveDeployments` row first, unless the user says to
  leave it running.
- It cannot be undone. Name the workflow and ask first.

A single version is `DELETE /workflows/$WF/versions/$VERSION`. It is refused
with `400` for the current version, a locked one, one of the few newest (kept
for rollback; the message says how many) and one an account still runs. Read
`versions` and `liveDeployments` in `GET /full` before asking.
