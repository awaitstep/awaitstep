---
title: Expressions
---

# Expressions

Expressions let you pass data from one step to another without writing glue code. They use a <code v-pre>{{nodeId.property}}</code> syntax that is resolved at code generation time.

## Syntax

```
{{nodeId.property}}
{{nodeId.nested.property}}
{{nodeId.arrayField[0].name}}
```

- `nodeId` — the ID of an upstream node (shown in the node config drawer)
- `property` — a dot-separated path into the node's output

## Where expressions can be used

Expressions can be used in any config field of type `string`, `expression`, or `textarea`. They are also used in Branch conditions and Loop collection fields.

| Field type   | Expression support                                                            |
| ------------ | ----------------------------------------------------------------------------- |
| `string`     | Yes — embedded in the value, e.g. <code v-pre>Hello {{user_step.name}}</code> |
| `expression` | Yes — the entire value is an expression                                       |
| `textarea`   | Yes — embedded in multi-line text                                             |
| `number`     | No — use a Step node to compute numeric values                                |
| `select`     | No — options are fixed at design time                                         |
| `secret`     | No — secrets bind to env vars, not upstream outputs                           |
| `code`       | Yes — reference upstream vars directly by name in JavaScript                  |

## Examples

### Passing an email address

In a **Send Email** node's "To" field:

```
{{create_user.email}}
```

This resolves to the `email` property of the `create_user` step's return value.

### Nested property access

```
{{parse_webhook.body.order.id}}
```

### Embedding in text

In a message body field:

```
Hello {{user.firstName}}, your order {{place_order.orderId}} has been confirmed.
```

## How expressions resolve

At code-generation time, <code v-pre>{{nodeId.property}}</code> is replaced with a JavaScript property access on the step result variable:

```typescript
// {{create_user.email}} becomes:
create_user.email

// {{parse_webhook.body.order.id}} becomes:
parse_webhook.body.order.id
```

Inside template literal strings (e.g. step names), expressions are wrapped in `${}`:

```typescript
await step.do(`Send email to ${create_user.email}`, async () => {
  /* ... */
})
```

## Autocomplete

In config fields that support expressions, the UI provides autocomplete. After typing <code v-pre>{{</code>, a dropdown shows all upstream nodes and their typed output fields. Navigate with arrow keys and press Enter to insert.

The autocomplete tree mirrors the `outputSchema` of each node definition.

## Validation

AwaitStep validates expressions at save time:

| Error                             | Cause                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| `References nonexistent node "x"` | The node ID does not exist in the workflow                 |
| `References downstream node "x"`  | The referenced node is not upstream (would create a cycle) |
| `References the current node "x"` | A node cannot reference its own output                     |

:::tip
Node IDs are auto-generated slugs like `step_1`, `http_request_2`. You can rename a node in its config drawer — the ID stays stable but the display name changes. The ID used in expressions is always the internal node ID, visible in the drawer's header.
:::

## Accessing the trigger payload

The trigger payload is available on `event.payload` inside Step node code. It is not available as an expression outside of Step nodes. To pass trigger data downstream as an expression, extract it in a Step node and return it:

```typescript
// In a "Parse Trigger" step:
return {
  orderId: event.payload?.orderId,
  userId: event.payload?.userId,
}
```

Then reference <code v-pre>{{parse_trigger.orderId}}</code> in downstream nodes.
