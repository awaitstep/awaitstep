import type {
  AvailableConnection,
  NewProjectConnectionInput,
  ProjectConnection,
  ProjectConnections,
} from '../../../types/dashboard/project-connections'
import { getDb, type ConnectionRow, type MockDb, type ProjectRow } from '../db'
import {
  type MockContext,
  endpoint,
  forbiddenError,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { personById, projectScope } from './records'
import { newId, requireScope } from './resolve'

// A project's accounts (23a–23c) on dummy data: fixtures and trivial changes.
// Dummy tokens are never checked (D-P5-5).

const ACCOUNT_ID = /^[a-f0-9]{32}$/i

function inProject(ctx: MockContext, orgSlug: string, projectSlug: string) {
  const db = getDb()
  const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
  return { db, org, project: project! }
}

function managedProject(ctx: MockContext, orgSlug: string, projectSlug: string) {
  const found = inProject(ctx, orgSlug, projectSlug)
  const can = projectScope(found.db, ctx, found.project).viewerCan.manageSettings
  if (!can.allowed) throw forbiddenError(can.reason!)
  return found
}

function serves(row: ConnectionRow, project: ProjectRow): boolean {
  if (row.projectId) return row.projectId === project.id
  return row.projects === 'all' || row.projects.includes(project.id)
}

function accountsOf(db: MockDb, project: ProjectRow) {
  return db.projectConnections
    .filter((pc) => pc.projectId === project.id)
    .map((pc) => ({ pc, row: db.connections.find((c) => c.id === pc.connectionId) }))
    .filter((a): a is { pc: (typeof a)['pc']; row: ConnectionRow } => a.row !== undefined)
}

function defaultOf(db: MockDb, project: ProjectRow): ConnectionRow | undefined {
  return accountsOf(db, project).find((a) => a.pc.isDefault && serves(a.row, project))?.row
}

export const listProjectConnections = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectConnections => {
    const { db, project } = inProject(ctx, orgSlug, projectSlug)
    const connections: ProjectConnection[] = accountsOf(db, project)
      .map(({ pc, row }) => ({
        id: row.id,
        provider: 'cloudflare',
        name: row.name,
        accountSuffix: row.accountId.slice(-4),
        createdByName: personById(db, row.addedBy).name,
        scope: row.projectId ? ('project' as const) : ('shared' as const),
        tokenStatus: 'active' as const,
        tokenExpiresAt: row.tokenExpiresAt,
        isDefault: pc.isDefault,
        available: serves(row, project),
        deployments: { count: row.deployments, lastAt: row.lastDeployAt },
        deployedFrom: db.workspaceConnections
          .filter((wc) => wc.connectionId === row.id)
          .map((wc) => db.workspaces.find((w) => w.id === wc.workspaceId)?.name)
          .filter((name): name is string => name !== undefined),
        addedAt: row.lastDeployAt ?? new Date().toISOString(),
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
    const fallback = defaultOf(db, project)
    const workspaces = db.workspaces
      .filter((w) => w.projectId === project.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => {
        const own = db.workspaceConnections.find((wc) => wc.workspaceId === w.id)
        const override = own && db.connections.find((c) => c.id === own.connectionId)
        const chosen = override ?? fallback
        return {
          workspaceId: w.id,
          name: w.name,
          connectionId: chosen?.id ?? null,
          connectionName: chosen?.name ?? null,
          source: override
            ? ('override' as const)
            : chosen
              ? ('default' as const)
              : ('none' as const),
          lastDeployAt: chosen?.lastDeployAt ?? null,
        }
      })
    return { connections: rows(ctx, connections), workspaces }
  },
)

export const listAvailableProjectConnections = endpoint(
  (ctx, orgSlug: string, projectSlug: string): AvailableConnection[] => {
    const { db, org, project } = inProject(ctx, orgSlug, projectSlug)
    const added = new Set(accountsOf(db, project).map((a) => a.row.id))
    return db.connections
      .filter((c) => c.orgId === org.id && !c.projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        provider: 'cloudflare',
        name: c.name,
        accountSuffix: c.accountId.slice(-4),
        tokenStatus: 'active' as const,
        tokenExpiresAt: c.tokenExpiresAt,
        state: !serves(c, project)
          ? ('restricted' as const)
          : added.has(c.id)
            ? ('added' as const)
            : ('available' as const),
        restrictedTo:
          c.projects === 'all'
            ? []
            : c.projects
                .map((id) => db.projects.find((p) => p.id === id)?.name)
                .filter((name): name is string => name !== undefined),
      }))
  },
)

export const addProjectConnections = mutation(
  (ctx, orgSlug: string, projectSlug: string, connectionIds: string[]): void => {
    const { db, org, project } = managedProject(ctx, orgSlug, projectSlug)
    const hasDefault = db.projectConnections.some(
      (pc) => pc.projectId === project.id && pc.isDefault,
    )
    const addable = db.connections.filter(
      (c) =>
        connectionIds.includes(c.id) &&
        c.orgId === org.id &&
        !c.projectId &&
        serves(c, project) &&
        !db.projectConnections.some(
          (pc) => pc.projectId === project.id && pc.connectionId === c.id,
        ),
    )
    if (addable.length === 0) {
      throw invalidError('That account isn’t available to this project.')
    }
    addable.forEach((c, i) =>
      db.projectConnections.push({
        projectId: project.id,
        connectionId: c.id,
        isDefault: !hasDefault && i === 0,
      }),
    )
  },
)

export const createProjectConnection = mutation(
  (ctx, orgSlug: string, projectSlug: string, input: NewProjectConnectionInput): void => {
    const { db, org, project } = managedProject(ctx, orgSlug, projectSlug)
    const name = input.name.trim()
    if (!name) throw invalidError('The connection needs a name', 'name')
    if (!ACCOUNT_ID.test(input.accountId.trim())) {
      throw invalidError('An account ID is 32 letters and digits (0–9, a–f)', 'accountId')
    }
    if (!input.token.trim()) throw invalidError('Paste the API token', 'token')
    const id = newId('conn')
    db.connections.push({
      id,
      orgId: org.id,
      name,
      accountId: input.accountId.trim(),
      addedBy: ctx.userId,
      tokenExpiresAt: null,
      projects: [project.id],
      deployments: 0,
      lastDeployAt: null,
      projectId: project.id,
    })
    const mine = db.projectConnections.filter((pc) => pc.projectId === project.id)
    const makeDefault = input.makeDefault || !mine.some((pc) => pc.isDefault)
    if (makeDefault) mine.forEach((pc) => (pc.isDefault = false))
    db.projectConnections.push({ projectId: project.id, connectionId: id, isDefault: makeDefault })
  },
)

export const replaceProjectConnectionToken = mutation(
  (ctx, orgSlug: string, projectSlug: string, connectionId: string, token: string): void => {
    const { db, project } = managedProject(ctx, orgSlug, projectSlug)
    const row = db.connections.find((c) => c.id === connectionId && c.projectId === project.id)
    if (!row) throw notFoundError()
    if (!token.trim()) throw invalidError('Paste the API token', 'token')
    row.tokenExpiresAt = null
  },
)

export const removeProjectConnection = mutation(
  (ctx, orgSlug: string, projectSlug: string, connectionId: string): void => {
    const { db, project } = managedProject(ctx, orgSlug, projectSlug)
    const ours = (pc: { projectId: string; connectionId: string }) =>
      pc.projectId === project.id && pc.connectionId === connectionId
    if (!db.projectConnections.some(ours)) throw notFoundError()
    db.projectConnections = db.projectConnections.filter((pc) => !ours(pc))
    const projectWorkspaces = new Set(
      db.workspaces.filter((w) => w.projectId === project.id).map((w) => w.id),
    )
    db.workspaceConnections = db.workspaceConnections.filter(
      (wc) => !(wc.connectionId === connectionId && projectWorkspaces.has(wc.workspaceId)),
    )
    db.connections = db.connections.filter(
      (c) => !(c.id === connectionId && c.projectId === project.id),
    )
    const left = db.projectConnections.filter((pc) => pc.projectId === project.id)
    if (left.length === 1) left[0]!.isDefault = true
  },
)

export const setProjectDefaultConnection = mutation(
  (ctx, orgSlug: string, projectSlug: string, connectionId: string): void => {
    const { db, project } = managedProject(ctx, orgSlug, projectSlug)
    const mine = db.projectConnections.filter((pc) => pc.projectId === project.id)
    if (!mine.some((pc) => pc.connectionId === connectionId)) {
      throw invalidError('That account isn’t one of this project’s.')
    }
    mine.forEach((pc) => (pc.isDefault = pc.connectionId === connectionId))
  },
)

export const setWorkspaceConnection = mutation(
  (
    ctx,
    orgSlug: string,
    projectSlug: string,
    workspaceId: string,
    connectionId: string | null,
  ): void => {
    const { db, project } = managedProject(ctx, orgSlug, projectSlug)
    if (!db.workspaces.some((w) => w.id === workspaceId && w.projectId === project.id)) {
      throw notFoundError()
    }
    db.workspaceConnections = db.workspaceConnections.filter((wc) => wc.workspaceId !== workspaceId)
    if (connectionId === null) return
    if (
      !db.projectConnections.some(
        (pc) => pc.projectId === project.id && pc.connectionId === connectionId,
      )
    ) {
      throw invalidError('That account isn’t one of this project’s.')
    }
    db.workspaceConnections.push({ workspaceId, connectionId })
  },
)
