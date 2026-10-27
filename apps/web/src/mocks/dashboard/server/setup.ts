import type { ProjectSetup } from '../../../types/dashboard/setup'
import { getDb } from '../db'
import { endpoint } from '../scenario'
import { requireScope } from './resolve'

/** Thin counts for the empty-project and empty-workspace pages (see `ProjectSetup`). */
export const getProjectSetup = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectSetup => {
    const { org, project } = requireScope(getDb(), ctx, { org: orgSlug, project: projectSlug })
    return {
      cloudflareConnected: org.cloudflareConnected,
      orgVariables: org.variableCount,
      projectVariables: project!.variableCount,
      projectKeys: project!.keyCount,
    }
  },
)
