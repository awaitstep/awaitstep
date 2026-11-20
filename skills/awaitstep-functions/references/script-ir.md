# The script IR

A Function is a `ScriptIR`: the workflow graph with `kind: "script"`. The canvas,
node generators and step contract are shared; the wrapper and the allowed nodes
are not.

```ts
interface ScriptIR {
  kind: 'script' // required, unlike a workflow
  irVersion: 3
  metadata: { name: string; description?: string; version: number; createdAt: string; updatedAt: string }
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: string
  runtime?: { provider?: string; env?: …; resources?: … }
}
```

There is no trigger block. The `kind` is the HTTP entry: the generated
`handlers/fetch.ts` imports `runGraph` from `#awaitstep/function` and calls it
with the request body as `event.payload`.

## Allowed nodes

| Node             | Function | Notes                                           |
| ---------------- | -------- | ----------------------------------------------- |
| `step`           | ✅       | One request; retries are per request            |
| `branch`         | ✅       |                                                 |
| `parallel`       | ✅       |                                                 |
| `race`           | ✅       |                                                 |
| `http_request`   | ✅       |                                                 |
| `try_catch`      | ✅       |                                                 |
| `loop`           | ✅       |                                                 |
| `break`          | ✅       |                                                 |
| `sub_workflow`   | ✅       | Fire-and-forget: it returns the instance handle |
| `sub_script`     | ✅       |                                                 |
| `sleep`          | ❌       | No durable instance                             |
| `sleep_until`    | ❌       | No durable instance                             |
| `wait_for_event` | ❌       | No durable instance                             |

A `400` names the node and says it requires a durable runtime. Remove it or
recreate the artifact as a workflow. Registry and Library custom nodes are
allowed like the built-ins; only the three durable nodes are refused.

## The response

`runGraph` returns an object of exported nodes. A node is exported when:

1. its name starts with `EXPORT_` (legacy marker; stripped from the key), or
2. its `data.export` is `true`, or
3. it is a `sub_workflow` / `sub_script` and `data.export` is not `false` (they
   default to exported).

`data.exportAs` sets the key; otherwise it is the node's variable name (the
sanitized display name). Only `step`, `http_request`, `sub_workflow`,
`sub_script`, custom nodes and registry nodes can be exported; a `branch`,
`loop`, `parallel`, `race`, `try_catch`, `sleep` or wait has no value to export.

```json
{ "export": true, "exportAs": "order" }
```

The default handler returns `Response.json(graph)`: the body is
`{ "order": … }` for the example, where the value is what the node produced.
For an `http_request` that is the reply's parsed body (JSON, else text), not a
`{ status, body }` wrapper. A custom handler may
return any response it likes; `runGraph` stays the same.

## Generated modules

A Function compiles to:

- `awaitstep/function.ts` — `Env`, `runGraph`, and `AWAITSTEP_RETENTION` when the
  graph calls a sub-workflow;
- `nodes/<var>.ts` — step/custom-node modules (generated, read-only);
- `worker.ts` — imports the handler and the graph module;
- `handlers/fetch.ts` — the project-owned entry.

Import the graph only through `#awaitstep/function` (handlers) or let codegen
place imports. Do not import `#app/worker` from a handler; that creates a cycle.

## Constraints that come from the kind

- **No durable instance lifecycle.** A call is recorded as a run and listed
  under Runs, but there is no pause/resume/terminate and no
  `POST /workflows/:id/trigger` (that route is session-only anyway).
- **No self workflow binding.** A `sub_workflow` can call another deployed
  workflow; the Function has no binding to itself.
- **Sub-workflows are fire-and-forget.** There is no durable host to poll to
  completion, so `waitForCompletion` has nothing to wait on. Read the returned
  `instanceId` from the response.
- **Retry scope is one request.** `retryLimit`/`timeout` still apply to a step,
  but the request is the whole lifetime.
- **Cloudflare only.** Deploying a Function needs the Cloudflare adapter.

## Saving

`POST /workflows/:id/versions` with `{ "ir": <script IR>, "baseGraphHash": "…" }`
— the same route, precondition and `400`/`409` rules as a workflow. The first
save seeds `handlers/fetch.ts`; later file edits go through the files API.
