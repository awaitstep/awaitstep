import type { ScopeSlugs } from '../../../types/dashboard/scope'
import type {
  ResolvedVariable,
  VariableInput,
  VariableScope,
  WorkspaceVariable,
} from '../../../types/dashboard/variables'
import { getDb, type VariableRow } from '../db'
import {
  type MockContext,
  conflictError,
  endpoint,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { workspaceRef } from './item-records'
import { visibleWorkspaces } from './records'
import { requireScope } from './resolve'
import { requireLevel } from './levels'

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

/**
 * Workspace settings → Variables: each name once, the closest level winning
 * (workspace › project › org), with where it's set and what it replaces.
 */
export const listWorkspaceVariables = endpoint(
  (ctx, slugs: Required<ScopeSlugs>): WorkspaceVariable[] => {
    const db = getDb()
    const { org, project, workspace } = requireScope(db, ctx, slugs)
    const levels = [
      { level: 'workspace' as const, id: workspace!.id, name: workspace!.name },
      { level: 'project' as const, id: project!.id, name: project!.name },
      { level: 'organization' as const, id: org.id, name: org.name },
    ]
    // One pass: each name's values, closest level first.
    const byName = new Map<string, { level: (typeof levels)[number]; row: VariableRow }[]>()
    for (const level of levels) {
      for (const row of db.variables.filter(
        (v) => v.level === level.level && v.scopeId === level.id,
      )) {
        byName.set(row.name, [...(byName.get(row.name) ?? []), { level, row }])
      }
    }
    const list = [...byName].map(([name, [winner, replaced]]): WorkspaceVariable => ({
      name,
      value: winner!.row.isSecret ? null : winner!.row.value,
      isSecret: winner!.row.isSecret,
      source: { level: winner!.level.level, name: winner!.level.name },
      // The winner is the closest level, so what it replaces is never the workspace.
      overrides: replaced ? (replaced.level.level as 'project' | 'organization') : null,
    }))
    // Closest level first, as the board lists them.
    const order = { workspace: 0, project: 1, organization: 2 }
    list.sort((a, b) => order[a.source.level] - order[b.source.level])
    return rows(ctx, list)
  },
)

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** The scope a variable input names, after checking the viewer may change its variables. */
function scopeFor(ctx: MockContext, orgSlug: string, scope: VariableScope) {
  const db = getDb()
  return { db, target: requireLevel(db, ctx, orgSlug, scope, 'variables').target }
}

/** New variable / Edit / Override, at the org, a project or a workspace. */
export const setVariable = mutation((ctx, orgSlug: string, input: VariableInput): void => {
  const { db, target } = scopeFor(ctx, orgSlug, input.scope)
  const name = input.name.trim()
  if (!VARIABLE_NAME.test(name)) {
    throw invalidError('Use letters, numbers and underscores, not starting with a number', 'name')
  }
  const existing = db.variables.find(
    (v) => v.level === input.scope.level && v.scopeId === target.id && v.name === name,
  )
  if (input.mode === 'create' && existing) {
    throw conflictError(`Already set in ${target.name}. Edit it instead`, 'name')
  }
  if (input.mode === 'edit' && !existing) throw notFoundError()
  if (existing) {
    // An empty value on a secret keeps the one already stored — but only while
    // it stays a secret: un-hiding it needs the value typed, or the stored
    // secret would show to everyone who can see variables.
    const keeps = input.value === '' && existing.isSecret
    if (keeps && !input.isSecret) {
      throw invalidError('Enter the value to stop hiding it', 'value')
    }
    if (input.value === '' && !keeps) throw invalidError('Give it a value', 'value')
    if (!keeps) existing.value = input.value
    existing.isSecret = input.isSecret
    return
  }
  if (input.value === '') throw invalidError('Give it a value', 'value')
  db.variables.push({
    level: input.scope.level,
    scopeId: target.id,
    name,
    value: input.value,
    isSecret: input.isSecret,
  })
})

export const deleteVariable = mutation(
  (ctx, orgSlug: string, scope: VariableScope, name: string): void => {
    const { db, target } = scopeFor(ctx, orgSlug, scope)
    const before = db.variables.length
    db.variables = db.variables.filter(
      (v) => !(v.level === scope.level && v.scopeId === target.id && v.name === name),
    )
    if (db.variables.length === before) throw notFoundError()
  },
)
