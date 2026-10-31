import type { OrgNode } from '../../../types/dashboard/resources'
import { getDb, type MockDb, type NodeRow } from '../db'
import {
  type MockContext,
  endpoint,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { managedOrg } from './levels'
import { personById } from './records'
import { requireScope } from './resolve'

// The org's node catalog (Resources → Nodes). Thin: install, uninstall and
// update flip the row; real installs and versions are the API's marketplace (B9).

function nodeRecord(db: MockDb, row: NodeRow): OrgNode {
  const installed = row.installedVersion !== null
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    version: row.installedVersion ?? row.latestVersion,
    latestVersion: row.latestVersion,
    source: row.source,
    author: row.authorId ? personById(db, row.authorId).name : undefined,
    installed,
    usage: installed ? row.usage : undefined,
    updateAvailable: installed && row.installedVersion !== row.latestVersion,
  }
}

/** Every node the org can use: what it built, then the marketplace. Any org member may look. */
export const listOrgNodes = endpoint((ctx, orgSlug: string): OrgNode[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  return rows(
    ctx,
    db.nodes.filter((n) => n.orgId === org.id).map((n) => nodeRecord(db, n)),
  )
})

/** The node, after checking the viewer runs the org. */
function managedNode(ctx: MockContext, orgSlug: string, nodeId: string) {
  const { db, org } = managedOrg(ctx, orgSlug)
  const node = db.nodes.find((n) => n.orgId === org.id && n.id === nodeId)
  if (!node) throw notFoundError()
  return node
}

/** Install: the latest version, in every project's palette. */
export const installNode = mutation((ctx, orgSlug: string, nodeId: string): void => {
  const node = managedNode(ctx, orgSlug, nodeId)
  if (node.installedVersion !== null) return
  node.installedVersion = node.latestVersion
  node.usage = 0
})

/** Uninstall: workflows using it keep their deployed version; the page warns first. */
export const uninstallNode = mutation((ctx, orgSlug: string, nodeId: string): void => {
  const node = managedNode(ctx, orgSlug, nodeId)
  if (node.source === 'custom') throw invalidError('Custom nodes stay installed')
  node.installedVersion = null
  node.usage = 0
})

/** Update: the installed version moves to the latest; workflows move on their next deploy. */
export const updateNode = mutation((ctx, orgSlug: string, nodeId: string): void => {
  const node = managedNode(ctx, orgSlug, nodeId)
  if (node.installedVersion === null) throw invalidError('Install it first')
  node.installedVersion = node.latestVersion
})
