---
name: create-node
description: Scaffold a complete AwaitStep registry or local custom node
disable-model-invocation: true
argument-hint: '[node_id]'
---

You are scaffolding a new AwaitStep custom node. Follow these steps exactly.

Read the full node authoring guide before proceeding:

- `.claude/skills/create-node/guide.md`

Also read the canonical NodeDefinition type:

- `packages/ir/src/node-definition.ts`

Decide which kind of node this is:

- **Registry node** (default): `registry/nodes/<id>/`, shared `base.json` + per-version `overrides.json`, published through the registry.
- **Local node**: `nodes/<id>/` with `node.json`, bundled into this app.

---

## Step 1: Validate Node ID

The node ID is `$ARGUMENTS`.

If no node ID was provided, ask the user for one before continuing.

Validate the node ID:

1. Must match `^[a-z][a-z0-9_-]*$`.
2. Must NOT conflict with builtin node IDs: `step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`, `loop`, `break`, `race`, `try_catch`, `sub_workflow`, `sub_script`.
3. Must NOT already exist under the chosen directory.

## Step 2: Gather Requirements

Ask the user ALL of the following in a single message:

1. **Registry or local node?**
2. **What does this node do?** (one sentence — becomes the `description`)
3. **What actions does it expose?** (for an `action` select; list the labels)
4. **What config fields does each action need?** (name, type, required?, description)
5. **What env vars/secrets does it need?** (and the `envVarName` for each)
6. **What does it output?** (field names, types, nullable?)
7. **What category?** (`Payments`, `Email`, `Messaging`, `Database`, `Storage`, `AI`, `Authentication`, `HTTP`, `Scheduling`, `Notifications`, `Data`, `Utilities`, `Control Flow`, `Internal`, `CRM`, `Analytics`, `Developer Tools`, `Project Management`, `E-commerce`, `Customer Support`, `Forms`)
8. **What external API does it call?** (base URL and docs URL)
9. **Any npm dependencies?**

Wait for the user to answer before proceeding.

## Step 3: Generate files

### Registry node

Create exactly:

```
registry/nodes/<id>/
├── base.json
├── icon.svg
└── 1.0.0/
    ├── overrides.json
    └── template.ts
```

`base.json` is the full `NodeDefinition` **without** `version` and `description`.
`1.0.0/overrides.json` is `{ "version": "1.0.0", "description": "...", "docsUrl": "...", "runtime": { "defaultRetries": 2 } }`.
Do not create `<version>/node.json`; CI regenerates it.

### Local node

Create:

```
nodes/<id>/
├── node.json
├── template.ts
├── icon.svg
└── README.md
```

`node.json` is the full `NodeDefinition` including `version` and `description`.

### Definition rules

- `id` matches the directory.
- `description` is at most 120 characters.
- Every `secret` field has `envVarName`.
- Every `select`/`multiselect` field has non-empty `options`.
- `providers` only names platforms with a template (today: `cloudflare`).
- `docsUrl` points at the provider's API docs.
- `runtime.defaultRetries` is `2`; set a sensible `defaultTimeout`.

### Template rules

- Export one default async function accepting `ctx`.
- Read config from `ctx.config.<field>` and secrets from `ctx.env.<ENV_VAR>`.
- Use Web APIs (`fetch`, `crypto`, `URL`); no `fs`, `path`, `process`, `Buffer`.
- Throw on errors; never swallow them.
- Do not call durable primitives (`step.do`, `step.sleep`, `step.waitForEvent`).
- Import only packages declared in `dependencies`.
- Return an object matching `outputSchema`; mark nullable fields.

## Step 4: Validate

Registry node:

```bash
pnpm --filter @awaitstep/registry validate
```

Local node:

```bash
pnpm nodes:generate
```

Fix every error. Do not run `registry/scripts/build-index.ts`; do not stage
`<version>/node.json` or `registry/index.json`.

## Step 5: Summary

Present:

- files created;
- action labels and config fields;
- output fields and nullability;
- required env vars;
- the validator command and its result.
