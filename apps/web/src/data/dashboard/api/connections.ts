import type { ConnectionSummary } from '@awaitstep/ir'
import type { ApiConnectionProjects } from '../../../lib/dashboard-api'
import type { Connection } from '../../../types/dashboard/org-settings'

// Connection rows → the cards on Org Settings › Connections. The API names
// the account by its suffix and the projects by what the reader can see.

export function toConnection(row: ConnectionSummary): Connection {
  return {
    id: row.id,
    name: row.name,
    accountSuffix: row.accountSuffix ?? '',
    addedBy: { id: row.createdBy, name: row.createdByName ?? 'a former member' },
    tokenStatus: row.tokenStatus,
    tokenExpiresAt: row.tokenExpiresAt,
    projects: row.allProjects ? 'all' : row.projects.map(({ id, name }) => ({ id, name })),
    hiddenProjects: row.hiddenProjects,
    deployments: row.deployments,
  }
}

/** The dialog's and the chips' `'all' | ids` as the API takes it. */
export function toProjectsBody(projects: 'all' | string[]): ApiConnectionProjects {
  return projects === 'all' ? { allProjects: true } : { allProjects: false, projectIds: projects }
}
