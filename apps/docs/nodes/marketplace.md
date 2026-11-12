# Marketplace

The AwaitStep marketplace is a public registry of community-authored custom nodes. Browse integrations, install them into your project, and contribute your own nodes back to the community.

## Browsing Nodes

Open the marketplace from the canvas toolbar. Nodes are organized by category with search and filtering.

![Node Marketplace with categories and install buttons](/images/marketplace.png)

Nodes are searchable by name, category, tag, and author. Each node listing shows:

- Name, description, and category
- Current version and publish date
- Author and license
- Config and output schema
- Provider and version details

## Installing a Node

To install a node from the marketplace into your project:

1. Open the marketplace and find the node you want.
2. Click **Install**.
3. Select the version to pin (defaults to the latest stable release).
4. The node is fetched from the registry, validated, and added to your project's node registry.

Once installed, the node appears in the node picker and can be added to any workflow in your project.

:::tip
Installed nodes are pinned to the version you selected. The node will not automatically update when a new version is published. See [Versioning](./versioning.md) for how to update.
:::

## Uninstalling a Node

To uninstall a node:

1. Go to **Project Settings → Nodes**.
2. Find the installed node and click **Uninstall**.

:::warning
You cannot uninstall a node that is currently used in one or more workflows. Remove all instances of the node from your workflows first.
:::

## Using a Custom Registry

By default, AwaitStep fetches nodes from the official registry at `https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry`. You can override this to use a private registry by setting the `REGISTRY_URL` environment variable in your project settings.

```
REGISTRY_URL=https://registry.your-company.com
```

A custom registry serves the same static layout:

| Path                                      | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `GET /index.json`                         | Node summaries, latest version, versions/checksums |
| `GET /nodes/:id/:version/node.json`       | The merged `NodeDefinition` for one version        |
| `GET /nodes/:id/:version/template.ts`     | The default template                               |
| `GET /nodes/:id/:version/templates/:p.ts` | An optional provider-specific template             |

The client verifies the version checksum from `index.json` against the definition and templates it fetched. The definition types come from `@awaitstep/ir`.

:::info
The `REGISTRY_URL` override applies to all node installs and update checks for the project. It does not affect built-in nodes, which are always bundled with AwaitStep.
:::

## Contributing Nodes

Anyone can publish a node to the official registry. To contribute:

### 1. Author the node

Follow the [Adding Nodes](../contributing/adding-nodes.md) guide. A registry node lives in `registry/nodes/<node_id>/` with a shared `base.json` and one directory per version containing `overrides.json` and `template.ts`.

### 2. Validate

```bash
pnpm --filter @awaitstep/registry validate
pnpm --filter @awaitstep/registry test
```

The validator checks the base/overrides merge, semver order, the `NodeDefinition` schema, action/config/env agreement, template parsing, imports, forbidden APIs, and output shapes. CI runs it on every pull request that touches `registry/`.

### 3. Submit a pull request

Open a pull request against `dev` in [awaitstep/awaitstep](https://github.com/awaitstep/awaitstep). CI runs the registry validator and tests. On merge to `main`, the registry-index workflow regenerates `<version>/node.json` and `registry/index.json` in an auto-merge PR.

### 4. Review and publish

A maintainer reviews the node for correct secret handling, current provider endpoints, thrown errors, and accurate output schemas. Once merged and the index is rebuilt, the version is available in the marketplace.

### Updating a published node

Add a new version directory instead of editing a published one. Put only the changed fields in its `overrides.json` and copy the previous template before applying the change. Old versions remain available; installed projects are not updated automatically.

## Official Nodes

Nodes authored by `awaitstep` are official integrations maintained by the AwaitStep team. They are marked with a verified badge in the marketplace. The official registry currently includes:

`activecampaign`, `airtable`, `anthropic`, `asana`, `convertkit`, `datadog`, `direct-mail`, `discord`, `elevenlabs`, `firebase-firestore`, `github`, `google-calendar`, `google-gemini`, `google-sheets`, `hubspot`, `intercom`, `jira`, `lemon-squeezy`, `linear`, `mailchimp`, `microsoft-teams`, `monday`, `notion`, `openai`, `paddle`, `pagerduty`, `paypal`, `perplexity`, `replicate`, `resend`, `s3`, `salesforce`, `segment`, `sendgrid`, `sentry`, `shopify`, `slack`, `stripe`, `supabase`, `telegram`, `trello`, `twilio`, `typeform`, `upstash-redis`, `zendesk`.

Community-contributed nodes are listed separately and are not officially maintained by AwaitStep.
