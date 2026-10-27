import type { ProjectSetup } from '../../../types/dashboard/setup'
import { getDb } from '../db'
import { endpoint } from '../scenario'
import { isLive } from './keys'
import { requireScope } from './resolve'

/** Counts for the empty-project and empty-workspace pages (see `ProjectSetup`). */
export const getProjectSetup = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectSetup => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const own = new Set(
      db.variables
        .filter((v) => v.level === 'project' && v.scopeId === project!.id)
        .map((v) => v.name),
    )
    // The project's value replaces the org's, so an org name it sets is counted once, as its own.
    const inherited = db.variables.filter(
      (v) => v.level === 'organization' && v.scopeId === org.id && !own.has(v.name),
    )
    return {
      cloudflareConnected: org.cloudflareConnected,
      orgVariables: inherited.length,
      projectVariables: own.size,
      // Expired keys stay listed (as "Expired") but no longer reach anything.
      projectKeys: db.keys.filter(
        (k) => k.level === 'project' && k.projectId === project!.id && isLive(k),
      ).length,
    }
  },
)
