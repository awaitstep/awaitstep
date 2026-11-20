# The template

`<version>/template.ts` is plain TypeScript with one default async function.

```ts
import type { Ctx, Output } from './ctx'

export default async function (ctx: Ctx): Promise<Output> {
  // ...
}
```

- `./ctx` is optional. The Library IDE generates `ctx.d.ts` from `node.json`
  (its `configSchema` as `Ctx`, its `outputSchema` as `Output`); codegen drops
  the import at deploy. Never store `ctx.ts`/`ctx.d.ts` in the item.
- One default export. No named exports.
- The function receives `ctx`; it is called once per node execution.

## What `ctx` carries

| Path         | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `ctx.config` | The node's fields, with `{{…}}` expressions already resolved      |
| `ctx.env`    | The consumer's environment; a secret field's `envVarName` is here |

Secrets are read from `ctx.env`, never from `ctx.config`:

```ts
const apiKey = ctx.env.WEATHER_API_KEY
```

A secret field with `envVarName: "WEATHER_API_KEY"` shows the value in the
node's environment panel, not in the graph. If it is missing at deploy, the env
check says so.

## Rules

1. Export one default async function.
2. Throw on errors. Never return `{ success: false }` or swallow a failure.
3. Use Web APIs: `fetch`, `crypto`, `URL`, `Response`, `TextEncoder`. No `fs`,
   `path`, `process`, `Buffer` or other Node-only APIs.
4. Do not call durable primitives (`step.do`, `step.sleep`,
   `step.waitForEvent`). The hosting step owns retries and durability.
5. Import only packages declared in `node.json` `dependencies`, and local files
   inside the version folder.
6. Return an object matching `outputSchema`; use `nullable: true` for fields
   that can be missing.
7. Never log or return a secret. Run outputs are persisted and visible.

## A complete template

```ts
import type { Ctx, Output } from './ctx'

export default async function (ctx: Ctx): Promise<Output> {
  const action = ctx.config.action as string
  const apiKey = ctx.env.WEATHER_API_KEY
  const city = ctx.config.city as string

  switch (action) {
    case 'Current weather': {
      const response = await fetch(
        `https://api.example.com/current?city=${encodeURIComponent(city)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      const data = (await response.json()) as {
        temperature?: number
        message?: string
      }
      if (!response.ok) {
        throw new Error(`Weather API ${response.status}: ${data.message ?? 'request failed'}`)
      }
      return { temperature: data.temperature ?? null, data }
    }
    case 'Forecast': {
      const response = await fetch(
        `https://api.example.com/forecast?city=${encodeURIComponent(city)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      if (!response.ok) throw new Error(`Weather API ${response.status}`)
      return { data: await response.json() }
    }
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
```

## Codegen behaviour to know

- A top-level placement becomes a generated module plus a `flow.step(...)` call;
  a placement inside a loop or branch stays inline in that block.
- `ctx.config` reads become step params; `ctx.env` reads become the environment.
- `{{…}}` in config fields is resolved before the template runs.
- The template's own imports are hoisted; `./ctx` is dropped.
- `export`/`exportAs` on the IR node decide the Function response; the template
  never sees them.

## Testing

There is no quick-test button for a node in the current version. Exercise it
through a workflow: place it, save, `source/check`, then a test session. A
throwing template surfaces as a failed step; a schema mismatch surfaces when a
downstream expression cannot find the field.

## Common failures

- "Unknown action" — the `select` options and the template's cases disagree.
- "Cannot find module" — an import is not declared in `dependencies`.
- Missing env var — the env check reports it; tell the user to set it, do not
  put the value in the graph.
- Output mismatch — a field is missing or the wrong type; fix the template and
  publish the next version.
