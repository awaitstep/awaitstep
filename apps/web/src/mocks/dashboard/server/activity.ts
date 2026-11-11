import type { ActivityItem } from '../../../types/dashboard/activity'
import { canSeeProject } from '../access'
import { getDb, type ItemRow, type MockDb, type ProjectRow, type WorkspaceRow } from '../db'
import { endpoint, rows } from '../scenario'
import { visibleWorkspaces } from './records'
import { requireScope } from './resolve'

// The org home shows a glance, not a log: the audit log has the rest.
const LIMIT = 5

function itemActivity(
  db: MockDb,
  project: ProjectRow,
  workspace: WorkspaceRow,
  item: ItemRow,
): ActivityItem[] {
  const where = {
    workflow: { name: item.name, kind: item.kind },
    project: { slug: project.slug, name: project.name },
    workspace: { slug: workspace.slug, name: workspace.name, colour: workspace.colour },
  }
  const found: ActivityItem[] = []
  const lastFailure = db.runs
    .filter((r) => r.itemId === item.id && r.result === 'failed')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (lastFailure) {
    found.push({
      id: `failed:${lastFailure.id}`,
      kind: 'failed',
      version: null,
      ...where,
      at: lastFailure.startedAt,
    })
  }
  if (item.status === 'deployed' && item.version !== null) {
    found.push({
      id: `deployed:${item.id}:${item.version}`,
      kind: 'deployed',
      version: item.version,
      ...where,
      at: item.updatedAt,
    })
  }
  if (item.sharing) {
    found.push({
      id: `shared:${item.id}`,
      kind: 'shared',
      version: null,
      ...where,
      at: item.sharing.sharedAt,
    })
  }
  return found
}

/**
 * The org home's "Recent activity": failures, deploys and shares, newest first,
 * read off the workspaces the viewer can open. Derived from the same rows the
 * pages show, so it moves with them.
 */
export const listActivity = endpoint((ctx, orgSlug: string): ActivityItem[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const activity = db.projects
    .filter((p) => p.orgId === org.id && canSeeProject(db, ctx, p))
    .flatMap((project) =>
      visibleWorkspaces(db, ctx, project).flatMap((workspace) =>
        db.items
          .filter((i) => i.workspaceId === workspace.id)
          .flatMap((item) => itemActivity(db, project, workspace, item)),
      ),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LIMIT)
  return rows(ctx, activity)
})
