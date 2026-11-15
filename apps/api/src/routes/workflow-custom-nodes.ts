import { Hono } from 'hono'
import {
  CUSTOM_NODE_TYPE_PREFIX,
  LIBRARY_NODE_MANIFEST,
  customNodeType,
  validateCustomNodeManifest,
  type NodeDefinition,
} from '@awaitstep/ir'
import type { WorkflowCustomNode } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { libraryReachOf } from '../middleware/auth.js'

export const workflowCustomNodes = new Hono<AppEnv>()

/** A palette entry: the definition the canvas registers, and where it comes from. */
export interface CustomNodeEntryResponse {
  itemId: string
  owner: WorkflowCustomNode['owner']
  version: string
  definition: NodeDefinition
}

/**
 * The icon as an `<img>` source, base64 so a large SVG is not inflated by
 * percent-encoding. Icons are checked as SVG documents on write and the
 * canvas only renders them through `<img>`, where an SVG runs no script.
 */
function iconUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

/** A version's manifest as the registry takes it, or null when it no longer parses. */
function parsedDefinition(manifest: string | null, version: string): NodeDefinition | null {
  if (!manifest) return null
  return validateCustomNodeManifest(manifest, version, LIBRARY_NODE_MANIFEST).definition
}

/**
 * One published node as the registry takes it: its latest `node.json` with
 * the defaults filled in, its id forced to `custom:<itemId>` (as the deploy's
 * registry layer forces it), and its icon. A version whose manifest no
 * longer parses is left out, so the palette never offers what a deploy refuses.
 */
function toEntry(node: WorkflowCustomNode): CustomNodeEntryResponse | null {
  const parsed = parsedDefinition(node.manifest, node.version)
  if (!parsed) return null
  // The manifest's own `icon` is never served: only the item's checked icon.svg.
  const { icon: _ignored, ...definition } = parsed
  return {
    itemId: node.itemId,
    owner: node.owner,
    version: node.version,
    definition: {
      ...definition,
      id: customNodeType(node.itemId),
      ...(node.icon && { icon: iconUrl(node.icon) }),
    },
  }
}

/**
 * The custom nodes this workflow can place: its workspace's and its
 * project's published nodes, each at its latest version. The workflow
 * route's access check found the workflow; its reach is read from its row.
 */
workflowCustomNodes.get('/:workflowId/custom-nodes', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const nodes = await c.get('db').listWorkflowCustomNodes(workflow.id, libraryReachOf(c))
  return c.json(nodes.flatMap((node) => toEntry(node) ?? []))
})

/** The most node types one templates read names; a graph places far fewer kinds. */
export const MAX_TEMPLATE_TYPES = 100

/**
 * The `custom:<itemId>` types named in `?types=` (comma-separated), as item
 * ids, or null when there are more than one read takes.
 */
function requestedItemIds(raw: string | undefined): string[] | null {
  const ids = new Set<string>()
  for (const type of (raw ?? '').split(',')) {
    const trimmed = type.trim()
    if (
      trimmed.startsWith(CUSTOM_NODE_TYPE_PREFIX) &&
      trimmed.length > CUSTOM_NODE_TYPE_PREFIX.length
    ) {
      ids.add(trimmed.slice(CUSTOM_NODE_TYPE_PREFIX.length))
    }
  }
  return ids.size > MAX_TEMPLATE_TYPES ? null : [...ids]
}

/**
 * The templates of the custom nodes named in `?types=`, by node type, as
 * `GET /nodes/templates` serves the registry's. Only nodes the listing
 * would return come back (same reach, same manifest check); the code preview names the
 * types its graph places, so it is sent no other node's code.
 */
workflowCustomNodes.get('/:workflowId/custom-nodes/templates', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const itemIds = requestedItemIds(c.req.query('types'))
  if (itemIds === null) {
    return c.json({ error: `Name at most ${MAX_TEMPLATE_TYPES} node types` }, 400)
  }
  const rows = await c
    .get('db')
    .listWorkflowCustomNodeTemplates(workflow.id, itemIds, libraryReachOf(c))
  const templates: Record<string, { cloudflare: string }> = {}
  for (const row of rows) {
    // The same rule as the listing: a version whose manifest no longer parses is left out.
    if (row.template === null || !parsedDefinition(row.manifest, row.version)) continue
    templates[customNodeType(row.itemId)] = { cloudflare: row.template }
  }
  return c.json(templates)
})
