import type { ResolvedVariable } from '../../../types/dashboard/variables'
import { getDb, type VariableRow } from '../db'
import { endpoint, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { visibleWorkspaces } from './records'
import { requireScope } from './resolve'

// Variables as a project resolves them. Creating and editing them is P6.

/**
 * Each name once: the project's value wins over the org's. Workspaces that
 * set their own value are listed as overrides (only ones the viewer can open).
 */
export const listProjectVariables = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ResolvedVariable[] => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const workspaces = visibleWorkspaces(db, ctx, project!)
    const resolved = new Map<string, { row: VariableRow; setAtName: string }>()
    for (const row of db.variables.filter(
      (v) => v.level === 'organization' && v.scopeId === org.id,
    )) {
      resolved.set(row.name, { row, setAtName: org.name })
    }
    for (const row of db.variables.filter(
      (v) => v.level === 'project' && v.scopeId === project!.id,
    )) {
      resolved.set(row.name, { row, setAtName: project!.name })
    }
    const list = [...resolved.values()]
      // The project's own first, as the board lists them.
      .sort(
        (a, b) => Number(a.row.level === 'organization') - Number(b.row.level === 'organization'),
      )
      .map(({ row, setAtName }): ResolvedVariable => ({
        name: row.name,
        value: row.isSecret ? null : row.value,
        isSecret: row.isSecret,
        setAt: { level: row.level as 'organization' | 'project', name: setAtName },
        overriddenIn: workspaces
          .filter((w) =>
            db.variables.some(
              (v) => v.level === 'workspace' && v.scopeId === w.id && v.name === row.name,
            ),
          )
          .map(workspaceRef),
      }))
    return rows(ctx, list)
  },
)
