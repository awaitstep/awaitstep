# Publish a module

Saving edits the working copy. Publishing snapshots it as an immutable version.
A consumer's next deploy bundles the **latest published** version of every
module it imports — there are no pins.

## Check

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/check$SCOPE" -H "$AUTH"
```

```json
{ "version": "1.0.1", "bumpedFrom": "1.0.0", "problems": [] }
```

- `version` is what publish would create, or `null` when it cannot choose one.
- `bumpedFrom` is the version it would replace when the declared version equals
  the latest.
- `problems` are path, version, size, import and dependency issues. Publish
  refuses while any remain.

## The version rule

A module publishes its `package.json` `version`:

| Declared version      | Result                                                          |
| --------------------- | --------------------------------------------------------------- |
| above the latest      | published as declared                                           |
| equal to the latest   | published as the next **patch**, written back to `package.json` |
| lower than the latest | refused with `400`                                              |
| not semver            | refused; use `major.minor.patch`                                |

Only plain release versions: no prerelease or build metadata.

## Publish

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/versions$SCOPE" -H "$AUTH"
```

```json
{ "version": "1.0.1", "seq": 3, "publishedAt": "…", "bumpedFrom": "1.0.0", "pruned": [] }
```

- `pruned` lists a version removed to stay within 3.
- A concurrent publish answers `409`; re-read the item and try again.
- A publish validates the working copy exactly as check does; fix problems
  first.

## What a publish means

- **The working copy stays.** You can keep editing; consumers still get the
  published version.
- **Consumers take it on their next deploy.** Not when you publish. A
  deployment records the library versions it bundled, so "still runs 1.4.1" is
  answerable.
- **No pins.** Redeploying an older workflow version also takes the latest
  library code. Say this when a user expects a rollback to pin code.
- **A published version is immutable.** To change it, publish the next patch.

## Consumers and delete

`GET /library/items/$ITEM/usages` lists the workflows and items that import it,
and each consumer's live deployment version when it has one. Deleting a used
module is `409` and names the consumers. Publishing does **not** re-check every
consumer's types; a breaking change surfaces on the consumer's next
check/deploy.

## Restore and history

`GET /library/items/$ITEM/versions` lists the kept versions (newest first), and
`POST /library/items/$ITEM/versions/:version/restore` copies that code into the
working copy as the next patch. Restore replaces the working copy; say so before
calling it.
