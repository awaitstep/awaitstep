# Verify a module

A module has no run of its own. `POST /library/items/$ITEM/check` judges its
shape — `package.json`, `index.ts`, paths, sizes, imports, the version — and
nothing else: it does not parse or type-check the code. A consumer's
`source/check` does not type-check it either. A broken module is found by the
first consumer that runs it, so test the code before you publish.

## 1. Test the code before writing it

A module is plain TypeScript with no AwaitStep imports of its own, so it runs
outside AwaitStep. Check it where you wrote it:

```bash
npx -y -p typescript tsc --noEmit --strict --target es2022 --module esnext \
  --moduleResolution bundler --lib es2022,dom index.ts
```

Then call it with a sample input the way its consumers will, and compare the
result with what you expect. A `#modules/<other>` import does not resolve
outside AwaitStep; test that part through a consumer (step 4).

Tell the user which checks ran. Never report the module as tested when only the
item check ran.

## 2. Write and check the item

Write each file with its precondition (`If-None-Match: *` or `If-Match`), then:

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/library/items/$ITEM/check$SCOPE" -H "$AUTH"
# 200 { "version": "1.0.1", "bumpedFrom": "1.0.0", "problems": [] }
```

Fix every entry in `problems`. A `version` of `null` means publish cannot pick
one.

## 3. Publish — when the user asks

See [publish.md](publish.md). Consumers pick the new version up on their **next deploy**, and
there are no pins: every consumer's next deploy takes it.

## 4. Check a consumer

List who imports the module:

```bash
curl -sS "$AWAITSTEP_API_URL/library/items/$ITEM/usages$SCOPE" -H "$AUTH"
```

For a consumer workflow the key can reach (`workflows:read`):

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/source/check$SCOPE" -H "$AUTH"
```

- `"Module \"<slug>\" has no published version yet"` means it was never
  published.
- An unresolved import names the path the consumer asked for, such as a
  subpath the module does not have.

Then run the consumer in a test session (`awaitstep-workflows`, step 6). A test
session bundles the **latest published** version, not the working copy, so it
tests what you published. This is the first time the module's code runs inside
AwaitStep.

## 5. When a published version is broken

A published version cannot change. Either fix the code and publish the next
patch, or restore the last good version
(`POST /library/items/$ITEM/versions/:version/restore`, which becomes the next
patch) and publish that. Consumers already deployed keep the version they
bundled until they redeploy, so tell the user which ones the `usages` list
shows as live.
