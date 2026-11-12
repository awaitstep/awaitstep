import { Hono } from 'hono'
import {
  inheritedWorkspaceRole,
  libraryCreateCapability,
  libraryItemCapabilities,
} from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

export const libraryTree = new Hono<AppEnv>()

/**
 * The Library IDE's explorer (28d/28e) in one request: every item the
 * addressed place owns — the workspace's, or the project's own when no
 * workspace is named — each with its working copy and, for a custom node,
 * its published folders read-only. Sources stay behind: the IDE reads a
 * file when it opens it. In a workspace, the project's modules come along
 * by slug, id and latest version, which is what its imports resolve to.
 */
libraryTree.get('/tree', async (c) => {
  const workspaceId = c.get('workspaceId') ?? null
  const tree = await c.get('db').getLibraryOwnerTree({
    projectId: c.get('projectId'),
    workspaceId,
  })
  const role = workspaceId ? c.get('workspaceRole') : inheritedWorkspaceRole(c.get('projectRole'))
  const owner = workspaceId
    ? { kind: 'workspace' as const, id: workspaceId }
    : { kind: 'project' as const, id: c.get('projectId') }
  // Only what the IDE draws: the tree, who may change it, and what a
  // workspace's `#modules/<slug>` means when it owns no such module.
  return c.json({
    owner,
    viewerCan: {
      edit: libraryItemCapabilities(role).edit,
      create: libraryCreateCapability(role),
    },
    items: tree.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      latestVersion: item.latestVersion,
      files: [
        ...item.files.map((file) => ({ path: file.path, hash: file.hash, readOnly: false })),
        ...item.published.map((file) => ({
          path: `${file.version}/${file.path}`,
          hash: file.hash,
          readOnly: true,
        })),
      ],
    })),
    projectModules: tree.projectModules,
  })
})
