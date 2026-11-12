# Custom Nodes

AwaitStep ships built-in nodes (`step`, `sleep`, `branch`, `parallel`, …) and
supports two kinds of custom nodes:

- **Local nodes** live under `nodes/<id>/` in the app repository and are bundled
  at build time.
- **Remote nodes** live under `registry/nodes/<id>/`, are installed from the
  marketplace, and are pinned to a version.

The public authoring guides are [Apps Docs — Custom Nodes](../apps/docs/nodes/custom-nodes.md)
and [Apps Docs — Adding Nodes](../apps/docs/contributing/adding-nodes.md). This
page is the repository-level summary.

## Layout

```
nodes/<id>/                         # local
├── node.json
├── template.ts | templates/<provider>.ts
├── icon.svg
└── README.md

registry/nodes/<id>/                # remote
├── icon.svg
├── base.json                       # all shared fields except version/description
└── <version>/
    ├── overrides.json              # version, description, changed fields
    └── template.ts                 # or templates/<provider>.ts
```

Local nodes are bundled by:

```bash
pnpm nodes:generate   # validate local nodes -> nodes/nodes.local.json
pnpm nodes:build      # merge built-ins + local -> nodes/registry.json
```

Registry nodes are validated without generating anything:

```bash
pnpm --filter @awaitstep/registry validate
pnpm --filter @awaitstep/registry test
```

Never run `registry/scripts/build-index.ts` locally and never commit
`<version>/node.json` or `registry/index.json`. CI regenerates them on `main`.

## Definition

`node.json` (local) or `base.json` + `<version>/overrides.json` (registry) is a
`NodeDefinition` from `@awaitstep/ir`:

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Read current weather for a city",
  "category": "Data",
  "author": "awaitstep",
  "license": "Apache-2.0",
  "configSchema": {},
  "outputSchema": {},
  "providers": ["cloudflare"],
  "runtime": { "defaultRetries": 2, "defaultTimeout": "30 seconds" }
}
```

Rules:

- `id` matches the directory and is `^[a-z][a-z0-9_-]*$`.
- Every `secret` field declares `envVarName`; the template reads it through
  `ctx.env`.
- Every `select`/`multiselect` field has non-empty `options`.
- `description` is at most 120 characters.
- `providers` lists only platforms with a template.
- Import an npm package only when it is declared in `dependencies`.

## Template contract

Templates export one default async function. There is no `@awaitstep/node-sdk`
package and no `NodeContext` type.

```typescript
export default async function (ctx) {
  const res = await fetch(ctx.config.url, {
    headers: { Authorization: `Bearer ${ctx.env.API_KEY}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return { data }
}
```

- Read config from `ctx.config.<field>`, secrets from `ctx.env.<ENV_VAR>`.
- Use Web APIs (`fetch`, `crypto`, `URL`); Cloudflare templates must not use
  `fs`, `path`, `process`, or `Buffer`.
- Do not call durable primitives (`step.do`, `step.sleep`, `step.waitForEvent`).
- Throw on errors; never return `{ success: false }`.
- Never log secrets.

For a top-level workflow node, codegen emits a generated module
(`nodes/<varName>.ts`) and a `flow.step(...)` call. Inside a loop/branch the
template stays inline. `ctx.config` reads become the step's params and `ctx.env`
reads become the generated `env` object. Edit the template, not the generated
module.

## Output schema

`outputSchema` types the node's result for expressions and the editor:

```json
{
  "temperature": { "type": "number" },
  "data": { "type": "object" }
}
```

Use `nullable: true` when an action can return `null` or omit the field. List
actions should return the provider's full response object under `data` rather
than a bare array.

## Versioning

Add a new registry version directory instead of editing a published one. Put
only changed fields in `overrides.json`; arrays replace the base array. Use
semver: patch for internal fixes, minor for additive fields/actions, major for
required-field or output-shape changes.

Local nodes are not version-pinned; they are always used at their current
version.
