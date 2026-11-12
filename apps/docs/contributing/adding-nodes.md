---
title: Adding Nodes
---

# Adding Nodes

This walkthrough adds an official integration node to the registry. Official
nodes live in `registry/nodes/` and are published when the registry index is
rebuilt on `main`.

If you want a private node for one project, use a local node instead — see
[Custom Nodes](../nodes/custom-nodes.md).

## 1. Create the node directory

Node IDs follow `^[a-z][a-z0-9_-]*$` and must match the directory name.

```
registry/nodes/weather/
├── icon.svg
├── base.json
└── 1.0.0/
    ├── overrides.json
    └── template.ts
```

`base.json` holds everything that does not change between versions. Each
version contributes only its `version`, `description`, and any changed fields.

## 2. Write base.json

`base.json` is a `NodeDefinition` without `version` and `description`:

```json
{
  "id": "weather",
  "name": "Weather",
  "category": "Data",
  "icon": "https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry/nodes/weather/icon.svg",
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

Rules:

- Every `secret` field must declare `envVarName`.
- Every `select`/`multiselect` field must have non-empty `options`.
- `description` is at most 120 characters.
- Use `docsUrl` for the provider's API documentation.
- `providers` lists the platforms the template actually supports. Today the
  official registry only deploys to Cloudflare.

## 3. Write the version files

`1.0.0/overrides.json`:

```json
{
  "version": "1.0.0",
  "description": "Read current weather for a city"
}
```

`1.0.0/template.ts` is a plain default async function. There is no SDK import:

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

Template rules:

- Export one default async function.
- Read config from `ctx.config.<field>` and secrets from `ctx.env.<ENV_VAR>`.
- Use only Web APIs (`fetch`, `crypto`, `URL`, `TextEncoder`).
- Throw on errors; do not return `{ success: false }`.
- Do not call durable primitives (`step.do`, `step.sleep`, `step.waitForEvent`);
  the workflow generator wraps the template in a step.
- Import an npm package only when it is declared in `base.json.dependencies`.

The generator turns the template into a generated module under `nodes/` and a
`flow.step(...)` call in the workflow. `ctx.config` values become the step's
params and `ctx.env` reads become `env` reads, so a template cannot read secrets
from the workflow's config object.

## 4. Validate

```bash
pnpm --filter @awaitstep/registry validate
```

It checks:

- base/overrides merge and semver order;
- the `NodeDefinition` schema, id/version match, icons and docs URLs;
- action options against template `case` labels;
- `ctx.config` and `ctx.env` references against the schema;
- template parsing, imports vs `dependencies`, forbidden Node APIs;
- output schema shapes.

Run the registry tests too when you are ready:

```bash
pnpm --filter @awaitstep/registry test
```

Do **not** run `build-index` locally. CI owns the generated
`<version>/node.json` and `registry/index.json`.

## 5. Add a version

Do not edit an existing published version for a behavior change. Add a new
directory and keep only the changed fields in its `overrides.json`:

```
weather/
├── base.json
├── 1.0.0/
│   ├── overrides.json   # { "version": "1.0.0", "description": "..." }
│   └── template.ts
└── 1.1.0/
    ├── overrides.json   # { "version": "1.1.0", "description": "...", "configSchema": { ... } }
    └── template.ts
```

Use semver: patch for an internal fix, minor for a new optional action or field,
major for a required-field or output-shape change. Arrays in overrides replace
the base array entirely.

## 6. Open a pull request

- Branch from `dev`: `feat/<node_id>-<short-summary>`.
- Stage `base.json`, the version's `overrides.json`, `template.ts`, and
  `icon.svg` only.
- Never stage `<version>/node.json` or `registry/index.json`.
- Target `dev`.

CI runs `pnpm --filter @awaitstep/registry validate` and the registry tests. On
merge to `main`, the registry-index workflow regenerates the node files and the
index in an auto-merge PR.

## Authoring checklist

- [ ] ID matches the directory and is not a builtin.
- [ ] `base.json` has no `version` or `description`.
- [ ] Each version has `overrides.json` and a template.
- [ ] Every action option has a `switch` case and vice versa.
- [ ] Every secret field has `envVarName`; the template reads it through `ctx.env`.
- [ ] Every `ctx.config` key exists in the schema.
- [ ] Errors throw; secrets are never logged.
- [ ] `providers` names only platforms with a template.
- [ ] `docsUrl` points at the provider's API docs.
- [ ] `pnpm --filter @awaitstep/registry validate` passes.
