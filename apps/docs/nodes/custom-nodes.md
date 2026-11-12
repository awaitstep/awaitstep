# Custom Nodes

Custom nodes extend AwaitStep with integrations or business logic. Once a node
is installed it appears in the node picker, renders a form from its config
schema, and exposes a typed output that downstream steps can reference.

There is no node SDK package. A template is a plain TypeScript file exporting a
default async function that receives `ctx`.

## Local vs remote nodes

- **Local nodes** live in your repository under `nodes/<node_id>/`. They are
  bundled when the app builds and are available without an install step.
- **Remote nodes** live in the registry (`registry/nodes/<node_id>/`), are
  installed into a project from the marketplace, and are pinned to a version.

```
nodes/<node_id>/                    registry/nodes/<node_id>/
├── node.json                       ├── icon.svg
├── template.ts                     ├── base.json
├── templates/<provider>.ts         └── <version>/
├── icon.svg                            ├── overrides.json
└── README.md                           └── template.ts
```

Local nodes are always used at their current version. Remote nodes keep the
version recorded in the workflow IR until someone updates the node.

## The NodeDefinition

Every node is a `NodeDefinition`:

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Read current weather for a city",
  "category": "Data",
  "tags": ["weather", "forecast"],
  "author": "your-github-username",
  "license": "Apache-2.0",
  "docsUrl": "https://docs.example.com/weather",
  "configSchema": {
    "action": {
      "type": "select",
      "label": "Action",
      "required": true,
      "options": ["Current Weather"]
    },
    "city": {
      "type": "string",
      "label": "City",
      "required": true,
      "description": "City name. Used by: Current Weather."
    },
    "apiKey": {
      "type": "secret",
      "label": "API Key",
      "required": true,
      "envVarName": "WEATHER_API_KEY",
      "description": "Weather API key."
    }
  },
  "outputSchema": {
    "temperature": { "type": "number", "description": "Current temperature" },
    "data": { "type": "object", "description": "Full API response" }
  },
  "providers": ["cloudflare"],
  "runtime": { "defaultRetries": 2, "defaultTimeout": "30 seconds" }
}
```

Required rules:

- `id` matches the directory and matches `^[a-z][a-z0-9_-]*$`.
- `description` is at most 120 characters.
- Every `secret` field declares `envVarName`; the template reads that variable
  through `ctx.env`, never `ctx.config`.
- Every `select`/`multiselect` field has a non-empty `options` array.
- `providers` names only platforms for which a template exists.
- `docsUrl` points at the provider's API documentation.

## Config field types

| Type          | UI control                  |
| ------------- | --------------------------- |
| `string`      | Text input                  |
| `textarea`    | Multi-line text             |
| `number`      | Numeric input               |
| `boolean`     | Toggle                      |
| `select`      | Dropdown (`options`)        |
| `multiselect` | Multi-select (`options`)    |
| `secret`      | Masked input (`envVarName`) |
| `code`        | Monaco TypeScript           |
| `json`        | Monaco JSON                 |
| `expression`  | Expression picker           |

Config expressions such as <code v-pre>{{fetch_user.id}}</code> are resolved before the
template is generated. They become step params, so a template reads the resolved
value from `ctx.config.<field>`.

## Templates

A template exports one default async function:

```typescript
export default async function (ctx) {
  const action = ctx.config.action
  const apiKey = ctx.env.WEATHER_API_KEY

  switch (action) {
    case 'Current Weather': {
      const response = await fetch(
        `https://api.example.com/current?city=${encodeURIComponent(ctx.config.city)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(`Weather API error: ${data.message ?? response.statusText}`)
      }
      return { temperature: data.temperature, data }
    }
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
```

Rules:

1. Export a default async function. No named exports.
2. Throw on errors; never return `{ success: false }`.
3. Use Web APIs (`fetch`, `crypto`, `URL`). Cloudflare templates must not use
   `fs`, `path`, `process`, or `Buffer`.
4. Never call durable primitives (`step.do`, `step.sleep`,
   `step.waitForEvent`); the workflow generator wraps the template.
5. Read secrets from `ctx.env`, never from `ctx.config`.
6. Never log secret values.
7. Import an npm package only when it is listed in `dependencies`.

### What the generator does

For a top-level workflow node, the template becomes a generated module
(`nodes/<varName>.ts`) plus a `flow.step(...)` call in the workflow entry. The
template body is rewritten so `ctx.config` reads become the step's params and
`ctx.env` reads become the generated `env` object. The module is generated code;
edit the template, not the generated file.

A template inside a loop or branch stays inline in its block. Scripts generate a
module like workflows do.

### Dependencies

Declare runtime packages in the definition:

```json
"dependencies": { "@aws-sdk/client-s3": "^3" }
```

They are installed during deploy and bundled with the generated project. A
template may import only packages declared here.

## Output schemas

`outputSchema` types the node's result for expressions and the Monaco editor:

```json
{
  "temperature": { "type": "number" },
  "data": { "type": "object" }
}
```

- `object` and `array` fields are free-form unless they declare `properties` or
  `items`.
- Use `"nullable": true` when an action can return `null` or omit the field.
- List actions should return the provider's full response object under `data`
  rather than a bare array, so the schema stays consistent across actions.

## Local nodes

1. Create `nodes/<node_id>/node.json` and `nodes/<node_id>/template.ts` (or
   `templates/<provider>.ts`).
2. Generate the bundle:

```bash
pnpm nodes:generate
pnpm nodes:build
```

`nodes:generate` validates every local node and writes `nodes/nodes.local.json`.
`nodes:build` merges built-ins and local nodes into `nodes/registry.json` (it
also runs automatically before `pnpm build`). Local node tests are optional;
there is no scaffolded test directory and no `@awaitstep/node-sdk/testing`
helper.

## Registry nodes and versioning

Official and community nodes use the base/overrides layout:

```
registry/nodes/weather/
├── base.json                 # everything except version/description/docsUrl
├── 1.0.0/
│   ├── overrides.json        # { version, description, docsUrl, changed fields }
│   └── template.ts
└── 1.1.0/
    ├── overrides.json
    └── template.ts
```

Validate with:

```bash
pnpm --filter @awaitstep/registry validate
```

The validator checks merge/semver order, the definition schema, action/config/
env agreement, template parsing, imports, forbidden APIs, and output shapes. Add
a version rather than editing a published one; only changed fields belong in
`overrides.json`. Never run `build-index` locally and never commit
`<version>/node.json` or `registry/index.json` — CI owns them.

See [Adding Nodes](../contributing/adding-nodes.md) for the full authoring flow.
