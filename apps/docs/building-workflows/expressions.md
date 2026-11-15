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
{{nodeId.headers["content-type"]}}
{{nodeId.property ?? "fallback"}}
```

- `nodeId` — the ID of an upstream node (shown in the node config drawer)
- `property` — a dot-separated path into the node's output
- `[0]` — array index access; `["key"]` — quoted keys for properties that are
  not valid identifiers (hyphens, spaces)
- `?? literal` — a default applied when the value is `null`/`undefined`;
  literals may be a `"string"`, number, `true`/`false`, or `null`

In a node's settings, anything inside <code v-pre>{{ }}</code> that does not
match this grammar is an error (see [Validation](#validation)). To keep braces
as text — a template for a service further on — put a space after them:
<code v-pre>{{ name }}</code> stays as it is. In code and JSON fields, and in a
step's code, braces are the language's own: only a well-formed expression
there is read, and everything else is left as it is.

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

```txt
{{create_user.email}}                 →  create_user.email
{{parse_webhook.body.order.id}}       →  parse_webhook.body.order.id
{{list_orders.items[0].id}}           →  list_orders.items[0].id
{{fetch_user.name ?? "anonymous"}}    →  (fetch_user.name ?? "anonymous")
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

AwaitStep checks every expression in a node's settings — on the canvas, in
Code and before a deploy:

| Error                                                       | Cause                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| <code v-pre>“{{}}” isn’t a valid expression…</code>         | Empty, or not in the grammar above                             |
| <code v-pre>“{{x.y” is never closed with }}.</code>         | <code v-pre>{{</code> with no <code v-pre>}}</code> of its own |
| `… is too long for an expression (256 characters at most).` | The text between the braces is too long to read                |
| `There’s no step called “x” in this workflow.`              | No node has that id or name                                    |
| `“x” runs after this node…`                                 | The node runs later, so its value isn't there yet              |
| `“x” is this node itself…`                                  | A node can't read its own output                               |

- In a node's settings, the message shows under the field as you type. Forms
  with their own layout (a branch, a loop, a break, an HTTP request, a step's
  code) list them under the form instead. Expression editors underline the
  expression.
- On the canvas, the Validation panel lists them, and Save waits until they
  are fixed (as it always has for a step that isn't there).
- In Code, **Insert** in the Add dialog waits until they are fixed. In a
  node's details, a value with one stays on screen and is kept as a change
  once it is fixed. Problems lists them.
- A deploy or a test run refuses a workflow with one.

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
