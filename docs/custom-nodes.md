# Custom Nodes

AwaitStep ships built-in nodes (`step`, `sleep`, `branch`, `parallel`, …) and
supports three kinds of custom nodes:

- **Local nodes** live under `nodes/<id>/` in the app repository and are bundled
  at build time.
- **Remote nodes** live under `registry/nodes/<id>/`, are installed from the
  marketplace, and are pinned to a version.
- **Library nodes** are written in a workspace's or project's Library (see
  [Library nodes](#library-nodes)).

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

## Library nodes

A Library node is a user's own node, authored in the dashboard's Library IDE
rather than in this repository. It has the registry's shape, with
`nodes/<slug>/<version>/{node.json,template.ts}` and `icon.svg` at the item
root, but:

- its node type is `custom:<itemId>`, so a rename never breaks a stored IR;
- `author`, `license` and `providers` default to `custom`, `UNLICENSED` and
  `["cloudflare"]`;
- it is **not pinned**. Every deploy takes its latest published version, and a
  workflow's Overview names the accounts that still run an older one;
- the canvas palette lists it under "Custom nodes" for its own workspace and,
  for a project node, every workspace of the project. Unpublished nodes are
  never offered;
- its template may import npm packages and `#modules/<slug>`, nothing
  relative.

## How a template node runs

These rules apply to every template node: local, marketplace and Library nodes.

- **The context is a real object.** The template's parameter (`ctx`, or any name, or a destructure such as `{ config, env }`) receives `{ env, config, inputs }`. `config` and `inputs` both hold the node's fields, as set on the canvas. Logging it, destructuring it or passing it to a helper works as written.
- **Its own module, as written.** The template becomes `nodes/<var>.ts`, in workflows and functions, inside containers too. The module holds the template unchanged: its imports, its own top-level constants and helpers, and its function as `$runTemplate`. A default export builds `{ env, config, inputs }` from the node's fields and calls it. Nothing in the template is rewritten, so its own variables (a local `params`, say) keep their meaning. The entry imports the module and calls it with `{ env }`, adding `inputs` when a field reads an earlier value or a loop's `item`.
- **Durable or Inline.** The node's panel has the step's "Inline — no step" switch.
  - Durable is the default, in workflows and functions. The node runs inside `flow.step` with the retries and timeout its `node.json` `runtime` declares: `defaultRetries`, with a 5-second exponential delay, and `defaultTimeout`. A node with no hints runs with the runtime's defaults.
  - Inline calls the module directly, with no step.
  - Either way, the node's value can be read downstream and returned with "Return this value".
- **Fields that read earlier values.** A field may hold `{{node.path}}`, where `node` is an earlier node's id or the name its code goes by (`sample_step`, as a step reads `inputs.sample_step`); write it without spaces. A field that is a whole `{{…}}` hands the template the value itself (an object stays an object); text around expressions makes a string. `{{event.payload.x}}` reads the trigger's payload.
- **Its value is bound.** When the template returns a value, the generated code binds it, `const <var> = …`, in workflows and functions, whether or not anything reads it.
- **Return this value.** In a function, the node's panel has the switch, as a step's does. The function then returns the node's value under its name, or under the key set.
- `inline`, `export` and `exportAs` are reserved. They are the placement's own settings, never passed to the template, and a Library node's `configSchema` may not declare them.
