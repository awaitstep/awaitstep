# Publish a custom node

A custom node publishes a version **folder**. Unlike a module, there is no
`package.json` version to read: the folder name is the version, and exactly one
folder may be unpublished at a time.

## Check

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/check$SCOPE" -H "$AUTH"
```

```json
{ "version": "1.0.0", "bumpedFrom": null, "problems": [] }
```

Problems include a manifest that does not parse, a `version` that disagrees with
the folder, a second draft folder, a bad path, an oversized file or an unresolved
import. Publish refuses while any remain.

## Publish — only when the user asks

Every consumer's next deploy takes the new version, and a fourth publish removes
the oldest for good. Ask first.

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/versions$SCOPE" -H "$AUTH"
```

- Publishes the single unpublished folder; it must be **above** the latest
  published version (the first may be `1.0.0`).
- The folder becomes a read-only `library_versions` row. A later write to it is
  `409`.
- At most **3 versions** are kept; publishing a fourth prunes the oldest.
- The response is `{ version, seq, publishedAt, bumpedFrom, pruned }`; for a
  node `bumpedFrom` is null (it never auto-bumps).
- The working copy is now empty of that folder. To make the next version, start
  from the latest.

## The next version

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/versions/1.0.0/restore$SCOPE" -H "$AUTH"
```

Restore copies that version's code into the working copy as the next patch
(`1.0.1/…`); an open draft folder is replaced, so say so before calling it. Then
edit the new folder, check, and publish.

A manually created next folder works the same way: `1.0.1/node.json` and
`1.0.1/template.ts`, version values matching the folder, and no other draft
folder open.

## What a publish means

- **Consumers take the latest published version on their next deploy.** Not when
  you publish. A workflow already deployed keeps running what it bundled.
- **No pins.** Redeploying an older workflow version also takes the latest
  library node.
- **A published folder is immutable.** A fix is a new patch folder.
- **Deleting is refused while used.** `GET /library/items/$ITEM/usages` names the
  consumers; the delete guard uses the same rows.

## The icon

`icon.svg` sits at the item root, not in a version folder. It is checked on
write: an SVG document, at most 32 KB, with no script, event handler,
`<foreignObject>`, embedded `data:` or `javascript:` URL. It is served to the
palette through `<img>`, so it runs nothing. Publishing a new version does not
change the icon; writing it is a separate file operation.

## Placement

`GET /workflows/:id/custom-nodes` returns the published nodes the workflow can
use:

```json
[
  {
    "itemId": "it_…",
    "owner": "workspace",
    "version": "1.0.0",
    "definition": {
      "id": "custom:it_…",
      "name": "Weather",
      "version": "1.0.0",
      "description": "…",
      "configSchema": { "city": { "type": "string", "label": "City" } },
      "outputSchema": { "temperature": { "type": "number" } }
    }
  }
]
```

Place it with `type: "custom:<itemId>"`, `version` from the entry, and `data`
using `configSchema` keys. The registry forces the definition id at deploy, so a
rename never breaks stored IRs.

`GET /workflows/:id/custom-nodes/templates?types=custom:<itemId>` returns the
template source for a code preview, if needed. Do not store it; edit the item.
