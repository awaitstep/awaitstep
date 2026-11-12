import { inheritedWorkspaceRole, libraryCreateCapability } from '@awaitstep/ir'
import type { ApiLibrarySummary, LibraryPlace } from '../../../lib/library-api'
import { projectRoleOf, workspaceRoleOf } from '../access'
import { getDb } from '../db'
import { endpoint } from '../scenario'
import { requireScope } from './resolve'

/**
 * The dummy server's Library: always empty (the real one is the API's), with
 * the viewer's right to add to it, so the page's empty state and its New
 * buttons follow the scenario's role.
 */
export const getLibrarySummary = endpoint((ctx, place: LibraryPlace): ApiLibrarySummary => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, place)
  const role = workspace
    ? workspaceRoleOf(db, ctx, project!, workspace)
    : inheritedWorkspaceRole(projectRoleOf(db, ctx, project!))
  return {
    own: [],
    fromProject: [],
    marketplace: [],
    counts: { module: 0, node: 0, marketplace: 0 },
    viewerCan: { create: libraryCreateCapability(role) },
  }
})
