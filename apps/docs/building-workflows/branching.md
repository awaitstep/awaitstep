---
title: Branching
---

# Branching

The **Branch** node routes execution to one of several paths based on conditions. Only the matching branch runs; all others are skipped.

## Adding a branch

1. Drag a **Branch** node onto the canvas from the control-flow panel.
2. In the config drawer, add as many branches as you need.
3. Each branch has a **label** and a **condition** — a JavaScript expression that evaluates to a boolean.
4. The last branch can have an empty condition to act as an `else` fallback.
5. Connect each branch output to the first node of its path.

## Conditions

Conditions are plain JavaScript expressions. They have access to all upstream step outputs by their variable name.

| Example condition                   | Meaning                          |
| ----------------------------------- | -------------------------------- |
| `charge.success === true`           | Charge step returned success     |
| `validate.score >= 80`              | Validation score meets threshold |
| `event.payload?.tier === "premium"` | Trigger payload has a tier field |
| _(empty)_                           | Else / fallback                  |

## Generated code

A three-branch node (approved, rejected, fallback) compiles to:

```typescript
if (review.decision === 'approved') {
  const send_confirmation = await step.do('Send Confirmation', async () => {
    // ...
  })
} else if (review.decision === 'rejected') {
  const send_rejection = await step.do('Send Rejection', async () => {
    // ...
  })
} else {
  await step.do('Flag for Review', async () => {
    // ...
  })
}
```

## Merging branches

After the branch node, you can connect multiple branch outputs to a single downstream node. The downstream node runs after whichever branch executed. Only one branch runs per workflow instance.

:::tip
Always include an else branch. Without one, if no condition matches, the workflow silently skips to the next step after the branch merge point.
:::

## Nested branches

Branches can be nested. Place another Branch node inside any branch path. Generated code produces nested `if/else if/else` blocks.

:::warning
Deep nesting makes workflows hard to read. If you find yourself nesting more than two levels, consider splitting the workflow into a sub-workflow.
:::
