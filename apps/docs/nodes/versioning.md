# Node Versioning

Custom nodes use semantic versioning (semver). The version is declared in `node.json` and is stored in the `WorkflowIR` alongside each node instance.

## Semver in node.json

```json
{
  "id": "stripe_charge",
  "version": "1.0.0",
  ...
}
```

Follow standard semver conventions:

| Change                                                                       | Version bump | Example           |
| ---------------------------------------------------------------------------- | ------------ | ----------------- |
| Backwards-compatible new feature (new optional config field)                 | Minor        | `1.0.0` → `1.1.0` |
| Bug fix, internal change                                                     | Patch        | `1.0.0` → `1.0.1` |
| Breaking change (required field added, output schema changed, field removed) | Major        | `1.0.0` → `2.0.0` |

## How Versions Are Pinned

When a node is installed from the marketplace or added to a workflow, its version is pinned in the `WorkflowIR`. The `version` field on each `WorkflowNode` records the exact version used:

```json
{
  "nodes": [
    {
      "id": "charge_card",
      "type": "stripe_charge",
      "version": "1.2.3",
      ...
    }
  ]
}
```

This means a workflow's behavior is fully determined by its IR — including the exact node version used at the time it was designed.

## Updating a Node Version

When a new version of a node is available, a badge appears on affected nodes in the canvas. To update:

1. Open the node's config panel.
2. Click **Update to 1.x.x** in the version section.
3. Review any config field changes. New required fields must be filled before the workflow can be deployed.
4. Save the workflow. The new version is written to the IR.

:::warning
Updating a node version is a manual, per-workflow action. Existing deployed workflows are not automatically updated. A re-deploy is required after updating.
:::

## Breaking Changes

If a new node version introduces a breaking change (major version bump), the canvas shows an error badge on the node and blocks deploy until the issue is resolved. Common breaking changes:

- A previously optional config field is now required
- A config field is renamed or removed
- The output schema changes (a field renamed, removed, or its type changed)

When you update to a breaking version:

1. The canvas highlights which config fields need attention.
2. Expression references to removed or renamed output fields are shown as errors.
3. You must fix all errors before deploying.

## Deploying with Older Versions

Deployed workflows are unaffected by node version updates. A running workflow instance always executes the code that was generated at its deploy time. Updating a node version and re-deploying only affects new runs.

:::info
Each deploy generates fresh code from the current IR. The generated code is not stored — but the IR (which pins versions) is. Re-deploying the same IR always produces the same code.
:::

## Deprecating a Node

If you are a node author and you want to signal that a node should be replaced, set `deprecated: true` in `node.json`:

```json
{
  "id": "my_old_node",
  "version": "2.0.0",
  "deprecated": true,
  "deprecationMessage": "Use my_new_node instead. It supports OAuth 2.0.",
  "replacedBy": "my_new_node"
}
```

Deprecated nodes:

- Show a deprecation warning badge on the canvas.
- Still compile and deploy normally.
- Are hidden from the node picker's default view (but searchable).
- Display the `deprecationMessage` and a link to the replacement node in the config panel.

## Local Node Versioning

Local nodes (in your repo under `nodes/`) are not installed or pinned — they are always used at their current version. When you bump the version in `node.json` for a local node, existing workflows that use it will show an update prompt the next time the canvas loads.

If you make a breaking change to a local node, workflows using the old version will show validation errors until you update the affected nodes.
