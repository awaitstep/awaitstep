# Expressions

An expression passes a value from one node to another without glue code. The
canvas resolves it at code-generation time.

## Grammar

```
{{nodeId.property}}
{{nodeId.nested.property}}
{{nodeId.arrayField[0].name}}
{{nodeId.headers["content-type"]}}
{{nodeId.property ?? "fallback"}}
```

- `nodeId` is the **node id** (or its generated variable name; the validator
  accepts either, the id is stable).
- The path is property access, `[n]` for an array index, `["key"]` for a key
  that is not an identifier.
- `?? literal` supplies a default when the value is `null` or `undefined`;
  the literal is a string, number, `true`, `false` or `null`.
- The text between the braces is at most 256 characters.

To keep literal braces in text, put a space after them: `{{ name }}` is text.

## Where it works

| Field type      | Expressions                                                  |
| --------------- | ------------------------------------------------------------ |
| `string`        | Yes, embedded: `Hello {{user_step.name}}`                    |
| `expression`    | Yes, the whole value                                         |
| `textarea`      | Yes, embedded                                                |
| `number`        | No — compute it in a step                                    |
| `select`        | No — options are fixed at design time                        |
| `secret`        | No — secrets bind to env vars                                |
| `code` / `json` | Only well-formed expressions are read; other braces are code |

Branch conditions and loop collections are expressions too. They are JavaScript
conditions over upstream variable names; the canvas writes bare names
(`review.decision === 'approved'`), and `{{…}}` is resolved if you write it.

## Scope

- A node may name any node that runs **before** it. A later node, a missing node,
  or the node itself is an error, but **the API save does not check it**: a
  `POST /versions` with one succeeds. `source/check` reports it, and deploys and
  test runs refuse it. Run the check after every save.
- `event`, `env` and `trigger` are always in scope. `event.payload` is the
  trigger body. The reliable way to pass trigger data downstream is a step that
  returns the fields you need, then reference that step.
- Only upstream nodes appear in autocomplete.

## What it becomes

| Expression                     | Generated code               |
| ------------------------------ | ---------------------------- |
| `{{create_user.email}}`        | `create_user.email`          |
| `{{list[0].id}}`               | `list[0].id`                 |
| `{{user.name ?? "anonymous"}}` | `(user.name ?? "anonymous")` |

Inside a text value — a step name, a message body, an HTTP node's URL, header
or query value, a sub-script's URL or header — it becomes `${…}` in a template
string.

## Node id or variable name?

- In a settings field, `{{…}}` accepts the node id or the generated variable
  name. Prefer the **id**: it does not move when a display name changes.
- In step code and in a branch/loop condition, use the **variable name** — the
  sanitized display name (see `step-code.md`). There is no `{{}}` there.
- When a display name is ambiguous (duplicates, reserved globals), read
  `GET /workflows/:id/source` and use the variable the generated call uses.

## Validation messages

| Message                                                     | Meaning                              |
| ----------------------------------------------------------- | ------------------------------------ |
| `“{{}}” isn’t a valid expression…`                          | Empty or not in the grammar          |
| `“{{x.y” is never closed with }}.`                          | Missing closing braces               |
| `… is too long for an expression (256 characters at most).` | Shorten it                           |
| `There’s no step called “x” in this workflow.`              | No node has that id or variable name |
| `“x” runs after this node…`                                 | A forward reference                  |
| `“x” is this node itself…`                                  | A node cannot read its own output    |

On the canvas the message appears under the field (or below the node's form);
Save waits for it to be fixed. Deploy and test runs refuse a workflow with one.

## Examples

```json
{ "url": "https://api.example.com/users/{{fetch_user.id}}" }
{ "to": "{{create_user.email}}", "subject": "Welcome, {{create_user.name ?? \"friend\"}}" }
{ "condition": "charge.success === true" }
{ "collection": "{{list_orders.items}}" }
```

To pass trigger data to several nodes, extract it once:

```ts
export default async function parse_trigger({ event }: { event: { payload?: any } }) {
  return {
    orderId: event.payload?.orderId,
    userId: event.payload?.userId,
  }
}
```

Then use `{{parse_trigger.orderId}}` downstream.
