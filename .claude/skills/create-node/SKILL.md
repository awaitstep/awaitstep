---
name: create-node
description: Scaffold a complete AwaitStep custom node
disable-model-invocation: true
argument-hint: '[node_id]'
---

You are scaffolding a new AwaitStep custom node. Follow these steps exactly.

Read the full node authoring guide before proceeding:

- `.claude/skills/create-node/guide.md`

Also read the canonical NodeDefinition type and reference example:

- `packages/ir/src/node-definition.ts`
- `packages/ir/src/bundled-nodes/http-request.ts`

---

## Step 1: Validate Node ID

The node ID is: `$ARGUMENTS`

If no node ID was provided, ask the user for one before continuing.

Validate the node ID:

1. Must match `^[a-z][a-z0-9_]*$` (lowercase, underscores, starts with letter)
2. Must NOT conflict with builtin node IDs: `step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`
3. Must NOT already exist in `nodes/`

If validation fails, explain the issue and ask for a corrected ID.

## Step 2: Gather Requirements

Ask the user ALL of the following in a single message:

1. **What does this node do?** (one sentence — becomes the `description`)
2. **What config fields does it need?** (name, type, required?, description for each)
3. **Does it need any API keys or secrets?** (if yes: what env var name?)
4. **What does it output?** (field names and types)
5. **What category?** (one of: Payments, Email, Messaging, Database, Storage, AI, Authentication, HTTP, Scheduling, Notifications, Data, Utilities, Control Flow, Internal)
6. **What external API does it call?** (if any — provide the base URL)
7. **Which providers should it support?** (default: cloudflare only)

Wait for the user to answer before proceeding.

## Step 3: Generate Files

Create the following files in `nodes/<node_id>/`:

### 3a. `node.json`

Generate a complete NodeDefinition JSON file using the user's answers. Follow the exact schema from `packages/ir/src/node-definition.ts`. Set:

- `id`: the validated node ID
- `version`: `"1.0.0"`
- `author`: `"awaitstep"`
- `license`: `"Apache-2.0"`
- `providers`: based on user's answer (default `["cloudflare"]`)
- `runtime.defaultRetries`: `3` unless the user specified otherwise
- `runtime.defaultTimeout`: `"30 seconds"` unless the user specified otherwise

### 3b. `templates/cloudflare.ts`

Generate a Cloudflare Workers template that:

- Imports `NodeContext` from `@awaitstep/node-sdk`
- Defines `Config` and `Output` interfaces matching the schemas
- Marks secret fields as `never` in the Config interface
- Exports a default async function accepting `ctx: NodeContext<Config>`
- Makes the appropriate API call using `fetch` (Web APIs only)
- Accesses secrets via `ctx.env.SECRET_NAME`
- Throws on non-2xx responses with descriptive error messages
- Returns an object matching the output schema

### 3c. `tests/cloudflare.test.ts`

Generate a test file that:

- Uses vitest (`describe`, `it`, `expect`, `vi`, `beforeEach`)
- Uses `createMockContext` from `@awaitstep/node-sdk/testing`
- Includes a happy-path test verifying correct output
- Includes an error-path test verifying the template throws
- Includes a test verifying correct authorization header (if secrets are used)
- Mocks `global.fetch` — no real network calls

### 3d. `README.md`

Generate a README with:

- Node name as heading
- One-line description
- Supported providers list (✅/❌)
- Prerequisites (required accounts, env vars)
- Configuration table (Field, Type, Required, Description)
- Output table (Field, Type, Description)
- Example workflow usage
- Changelog with `### 1.0.0 — Initial release`

## Step 4: Validate

Run through the validation checklist from the guide against the generated files. Check every item. If any check fails, fix the issue immediately.

Checklist summary:

- `id` matches directory name and pattern
- `id` not a builtin
- Valid semver version
- Description under 120 chars
- Valid category
- All secret fields have `envVarName`
- All select/multiselect fields have `options`
- Each provider has a template file
- Templates export default async function
- Templates don't call step.do/step.sleep
- Templates throw on errors
- Secrets via `ctx.env` not `ctx.config`
- Tests have happy + error paths
- Tests mock fetch
- README has config and output tables

## Step 5: Summary

Present a summary to the user:

```
✅ Node scaffolded: <node_id>

Files created:
  nodes/<node_id>/node.json
  nodes/<node_id>/templates/cloudflare.ts
  nodes/<node_id>/tests/cloudflare.test.ts
  nodes/<node_id>/README.md

Config fields: <count>
  - <field>: <type> (required/optional)
  ...

Output fields: <count>
  - <field>: <type>
  ...

Required env vars:
  - <ENV_VAR_NAME>: <description>

Next steps:
  1. Review the generated files
  2. Test with: pnpm test nodes/<node_id>
  3. Validate with: pnpm validate nodes/<node_id>
```
