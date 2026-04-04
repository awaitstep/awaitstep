---
title: Expressions
---

# Expressions

Expressions let you pass data from one step to another without writing glue code. They use a `<span v-pre>&#123;&#123;nodeId.property&#125;&#125;</span>` syntax that is resolved at code generation time.

## Syntax

```
&#123;&#123;nodeId.property&#125;&#125;
&#123;&#123;nodeId.nested.property&#125;&#125;
&#123;&#123;nodeId.arrayField[0].name&#125;&#125;
```

- `nodeId` — the ID of an upstream node (shown in the node config drawer)
- `property` — a dot-separated path into the node's output

## Where expressions can be used

Expressions can be used in any config field of type `string`, `expression`, or `textarea`. They are also used in Branch conditions and Loop collection fields.

| Field type   | Expression support                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `string`     | Yes — embedded in the value, e.g. `Hello <span v-pre>&#123;&#123;user_step.name&#125;&#125;</span>` |
| `expression` | Yes — the entire value is an expression                                                             |
| `textarea`   | Yes — embedded in multi-line text                                                                   |
| `number`     | No — use a Step node to compute numeric values                                                      |
| `select`     | No — options are fixed at design time                                                               |
| `secret`     | No — secrets bind to env vars, not upstream outputs                                                 |
| `code`       | Yes — reference upstream vars directly by name in JavaScript                                        |

## Examples

### Passing an email address

In a **Send Email** node's "To" field:

```
&#123;&#123;create_user.email&#125;&#125;
```

This resolves to the `email` property of the `create_user` step's return value.

### Nested property access

```
&#123;&#123;parse_webhook.body.order.id&#125;&#125;
```

### Embedding in text

In a message body field:

```
Hello &#123;&#123;user.firstName&#125;&#125;, your order &#123;&#123;place_order.orderId&#125;&#125; has been confirmed.
```

## How expressions resolve

At code-generation time, `<span v-pre>&#123;&#123;nodeId.property&#125;&#125;</span>` is replaced with a JavaScript property access on the step result variable:

```typescript
// &#123;&#123;create_user.email&#125;&#125; becomes:
create_user.email

// &#123;&#123;parse_webhook.body.order.id&#125;&#125; becomes:
parse_webhook.body.order.id
```

Inside template literal strings (e.g. step names), expressions are wrapped in `${}`:

```typescript
await step.do(`Send email to ${create_user.email}`, async () => {
  /* ... */
})
```

## Autocomplete

In config fields that support expressions, the UI provides autocomplete. After typing `&#123;&#123;`, a dropdown shows all upstream nodes and their typed output fields. Navigate with arrow keys and press Enter to insert.

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

Then reference `<span v-pre>&#123;&#123;parse_trigger.orderId&#125;&#125;</span>` in downstream nodes.
