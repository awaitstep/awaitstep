# Rename, copy, move or delete a Library item

These work the same for a module and a custom node. Read the item first
(`GET /library/items/$ITEM`), and use `GET /library/items/$ITEM/usages` to see
who depends on it.

## Rename or describe

```bash
curl -sS -X PATCH "$AWAITSTEP_API_URL/library/items/$ITEM$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"name":"Lead scoring v2","description":"Score a lead"}'
```

- `name`, `description` and `slug` may change; any other field is refused.
  Needs `library:write`.
- A new **name** breaks nothing: a placed custom node is `custom:<itemId>`, and
  a module is imported by its slug.
- A **module's** new slug is refused with `409` while anything imports it,
  since `#modules/<slug>` imports would break. A custom node's slug is not
  guarded and does not need to be: placements use its id. `409` also means the
  slug is taken.

## Copy

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/duplicate$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"name":"Lead scoring (EU)"}'
# 201 the new item
```

- The copy is a new item with its own id, **unpublished**, starting again at
  `1.0.0`. A module copies its working copy. A custom node copies its newest
  code (the open draft, else the latest version) and its icon.
- `slug` is optional (derived from the name). Add `"to":"project"` to put the
  copy in the project's library instead of beside the original.
- `422` with `details` lists problems to fix first, such as too many imports.
  `422` without details means the library is full. `409` means the slug is
  taken.
- `"to":"project"` is refused with `403` for a workspace key, always, and for a
  key whose owner may not change the project's library.
- Nothing that used the original moves to the copy.

## Move a workspace item to the project

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/move$SCOPE" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"to":"project"}'
```

- The same item, with its id, versions and history, so its consumers keep
  working and every workspace in the project can use it. There is no move back.
- `409`: it is already the project's, the project has that slug, or it imports
  modules only its workspace has (the answer lists their `slugs`: move those
  first). The message says which.
- `422`: the project's library is full.
- `403`: always for a workspace key; otherwise the key's owner may not change
  the project's library.
- Moving changes who can see and edit the item. Ask first.

## Delete

Only when the user asks, naming the item. It cannot be undone.

```bash
curl -sS -X DELETE "$AWAITSTEP_API_URL/library/items/$ITEM$SCOPE" -H "$AUTH"
# 204 deleted
```

- Needs `library:delete`.
- `409` means it is still used. The answer's `consumers` names who uses it.
  Tell the user; removing those uses is their decision.
- A single file is `DELETE /library/items/$ITEM/files/<path>`, with `If-Match`
  like any file write.
