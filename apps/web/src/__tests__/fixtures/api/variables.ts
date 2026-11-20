import type {
  ApiOrgVariablePage,
  ApiResolvedProjectVariable,
  ApiResolvedWorkspaceVariable,
  ApiVariableReach,
  ApiVariableRow,
} from '../../../lib/dashboard-api'
import type { SeedDb, VariableRow } from '../seed/rows'

// Variables as `/env-vars` and `/env-vars/resolved` answer them, projected
// from the seed: a secret's value masked, each name once at a place.

const MASK = '••••••••'

function reaches(row: VariableRow, placeId: string): boolean {
  return row.reachIds === undefined || row.reachIds.includes(placeId)
}

function variableId(row: VariableRow): string {
  return `var_${row.level}_${row.scopeId}_${row.name}`
}

function orgIdOf(seed: SeedDb, row: VariableRow): string {
  if (row.level === 'organization') return row.scopeId
  const projectId =
    row.level === 'project'
      ? row.scopeId
      : seed.workspaces.find((w) => w.id === row.scopeId)!.projectId
  return seed.projects.find((p) => p.id === projectId)!.orgId
}

/** The stored row, as every variable answer carries it. */
export function variableRow(seed: SeedDb, row: VariableRow, now: Date): ApiVariableRow {
  const at = now.toISOString()
  return {
    id: variableId(row),
    level: row.level,
    organizationId: orgIdOf(seed, row),
    projectId:
      row.level === 'project'
        ? row.scopeId
        : row.level === 'workspace'
          ? (seed.workspaces.find((w) => w.id === row.scopeId)?.projectId ?? null)
          : null,
    workspaceId: row.level === 'workspace' ? row.scopeId : null,
    name: row.name,
    value: row.isSecret ? MASK : row.value,
    isSecret: row.isSecret,
    createdBy: 'usr_ama',
    createdAt: at,
    updatedAt: at,
  }
}

function reachOf(seed: SeedDb, row: VariableRow): ApiVariableReach {
  const isProjectRow = row.level === 'project'
  const own = (placeId: string) =>
    seed.variables.some(
      (v) =>
        v.name === row.name &&
        v.scopeId === placeId &&
        v.level === (isProjectRow ? 'workspace' : 'project'),
    )
  const candidates = isProjectRow
    ? seed.workspaces.filter((w) => w.projectId === row.scopeId)
    : seed.projects.filter((p) => p.orgId === row.scopeId)
  const listed = new Set(row.reachIds ?? [])
  return {
    all: row.reachIds === undefined,
    places: candidates
      .filter((c) => listed.has(c.id) && !own(c.id))
      .map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    blocked: candidates.filter((c) => own(c.id)).map((c) => c.id),
  }
}

export function orgVariables(seed: SeedDb, orgId: string, now: Date): ApiOrgVariablePage {
  const projects = seed.projects.filter((p) => p.orgId === orgId)
  const setsOwn = (projectId: string, name: string) =>
    seed.variables.some(
      (v) =>
        v.name === name &&
        ((v.level === 'project' && v.scopeId === projectId) ||
          (v.level === 'workspace' &&
            seed.workspaces.some((w) => w.id === v.scopeId && w.projectId === projectId))),
    )
  return {
    data: seed.variables
      .filter((v) => v.level === 'organization' && v.scopeId === orgId)
      .map((row) => ({
        ...variableRow(seed, row, now),
        overriddenIn: projects.filter((p) => setsOwn(p.id, row.name)).length,
        reach: reachOf(seed, row),
      })),
    nextCursor: null,
  }
}

export function projectVariables(
  seed: SeedDb,
  projectId: string,
  now: Date,
): ApiResolvedProjectVariable[] {
  const project = seed.projects.find((p) => p.id === projectId)!
  const org = seed.orgs.find((o) => o.id === project.orgId)!
  const resolved = new Map<string, { row: VariableRow; name: string }>()
  for (const row of seed.variables.filter(
    (v) => v.level === 'organization' && v.scopeId === org.id && reaches(v, projectId),
  )) {
    resolved.set(row.name, { row, name: org.name })
  }
  for (const row of seed.variables.filter(
    (v) => v.level === 'project' && v.scopeId === projectId,
  )) {
    resolved.set(row.name, { row, name: project.name })
  }
  const workspaces = seed.workspaces.filter((w) => w.projectId === projectId)
  return [...resolved.values()]
    .sort((a, b) => Number(a.row.level === 'organization') - Number(b.row.level === 'organization'))
    .map(({ row, name }) => ({
      ...variableRow(seed, row, now),
      setAt: { level: row.level, id: row.scopeId, name },
      reach: row.level === 'project' ? reachOf(seed, row) : null,
      overriddenIn: workspaces
        .filter((w) =>
          seed.variables.some(
            (v) => v.level === 'workspace' && v.scopeId === w.id && v.name === row.name,
          ),
        )
        .map((w) => ({ id: w.id, slug: w.slug, name: w.name, colour: w.colour })),
    }))
}

export function workspaceVariables(
  seed: SeedDb,
  workspaceId: string,
  now: Date,
): ApiResolvedWorkspaceVariable[] {
  const workspace = seed.workspaces.find((w) => w.id === workspaceId)!
  const project = seed.projects.find((p) => p.id === workspace.projectId)!
  const org = seed.orgs.find((o) => o.id === project.orgId)!
  const levels = [
    { level: 'workspace' as const, id: workspace.id, name: workspace.name, placeId: null },
    { level: 'project' as const, id: project.id, name: project.name, placeId: workspace.id },
    { level: 'organization' as const, id: org.id, name: org.name, placeId: project.id },
  ]
  const byName = new Map<string, { level: (typeof levels)[number]; row: VariableRow }[]>()
  for (const level of levels) {
    for (const row of seed.variables.filter(
      (v) =>
        v.level === level.level &&
        v.scopeId === level.id &&
        (level.placeId === null || reaches(v, level.placeId)),
    )) {
      byName.set(row.name, [...(byName.get(row.name) ?? []), { level, row }])
    }
  }
  const order = { workspace: 0, project: 1, organization: 2 }
  return [...byName.values()]
    .map(([winner, replaced]) => ({
      ...variableRow(seed, winner!.row, now),
      source: { level: winner!.level.level, id: winner!.level.id, name: winner!.level.name },
      overrides: replaced ? (replaced.level.level as 'project' | 'organization') : null,
    }))
    .sort((a, b) => order[a.source.level] - order[b.source.level])
}
