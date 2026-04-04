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
- README documentation

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

By default, AwaitStep fetches nodes from the official registry at `https://registry.awaitstep.dev`. You can override this to use a private registry by setting the `REGISTRY_URL` environment variable in your project settings.

```
REGISTRY_URL=https://registry.your-company.com
```

A custom registry must implement the same REST API as the official registry:

| Endpoint                  | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `GET /nodes`              | List all available nodes (with pagination and search) |
| `GET /nodes/:id`          | Get a specific node by ID (returns latest version)    |
| `GET /nodes/:id/:version` | Get a specific node at a specific version             |
| `GET /nodes/:id/versions` | List all published versions of a node                 |

Each endpoint returns a `NodeDefinition` object (for individual nodes) or an array of them (for listings). The shape matches the `NodeDefinition` type from `@awaitstep/ir`.

:::info
The `REGISTRY_URL` override applies to all node installs and update checks for the project. It does not affect built-in nodes, which are always bundled with AwaitStep.
:::

## Contributing Nodes

Anyone can publish a node to the AwaitStep marketplace. To contribute:

### 1. Author the Node

Follow the [Custom Nodes](./custom-nodes.md) guide to create your node in `nodes/<node_id>/`. Complete the authoring checklist before submitting.

### 2. Pass Validation

All nodes submitted to the marketplace are validated automatically:

- `node.json` must be valid and complete
- At least one template file must exist
- All tests must pass (`vitest run`)
- The node must not conflict with any existing node ID in the registry

### 3. Submit a Pull Request

Fork the [awaitstep/nodes](https://github.com/awaitstep/nodes) repository, add your node, and open a pull request. The automated CI pipeline will:

- Run `node.json` schema validation
- Run all template tests
- Check for naming conflicts with existing nodes
- Lint the TypeScript template files

### 4. Review and Publish

A maintainer will review your node for:

- Correct secret handling (secrets must use `envVarName` and be accessed via `ctx.env`)
- No Node.js APIs in Cloudflare templates
- Errors thrown, not swallowed
- README with config and output tables

Once approved, the node is published to the registry under your author name and the version declared in `node.json`.

### Updating a Published Node

To publish a new version, bump `version` in `node.json` following semver, update the README if needed, and open a new pull request. Both old and new versions remain available in the registry — installed projects are not automatically updated.

## Official Nodes

Nodes authored by `awaitstep` are official integrations maintained by the AwaitStep team. They are marked with a verified badge in the marketplace. Official node IDs currently include:

- `resend_send_email` — Send transactional email via Resend
- `stripe_charge` — Charge a customer via Stripe
- `stripe_refund` — Refund a Stripe charge
- `slack_post_message` — Post a message to Slack
- `openai_chat` — Call the OpenAI Chat Completions API
- `anthropic_message` — Call the Anthropic Messages API
- `d1_query` — Query a Cloudflare D1 database
- `r2_put` — Upload an object to Cloudflare R2
- `kv_get` / `kv_put` — Read and write Cloudflare KV

Community-contributed nodes are listed separately and are not officially maintained by AwaitStep.
