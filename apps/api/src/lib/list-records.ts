import type { Deployment, DeploymentListItem, Workflow, WorkflowVersion } from '@awaitstep/db'

// List rows as their pages render them. Code, IR, outputs, snapshots and the
// rows' internal author ids stay behind; a detail page keeps what it shows.

export interface DeploymentListRecord {
  id: string
  workflowId: string
  versionId: string | null
  connectionId: string | null
  serviceName: string
  status: string
  error: string | null
  createdAt: string
  takenDownAt: string | null
  createdByName: string | null
  version: number | null
  versionLocked: number | null
  connectionName: string | null
}

export function deploymentListRecord(
  row: Deployment & Partial<DeploymentListItem>,
): DeploymentListRecord {
  return {
    id: row.id,
    workflowId: row.workflowId,
    versionId: row.versionId,
    connectionId: row.connectionId,
    serviceName: row.serviceName,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    takenDownAt: row.takenDownAt,
    createdByName: row.createdByName ?? null,
    version: row.version ?? row.versionNumber,
    versionLocked: row.versionLocked ?? null,
    connectionName: row.connectionName ?? null,
  }
}

export function deploymentPageRecord<T extends { data: Deployment[]; nextCursor: string | null }>(
  page: T,
): Omit<T, 'data'> & { data: DeploymentListRecord[] } {
  return { ...page, data: page.data.map(deploymentListRecord) }
}

/** A version on its list: no IR, no dead columns. The detail read keeps the IR. */
export interface VersionListRecord {
  id: string
  workflowId: string
  version: number
  locked: number
  createdAt: string
  createdByName: string | null
}

export function versionListRecord(
  row: WorkflowVersion & { createdByName?: string | null },
): VersionListRecord {
  return {
    id: row.id,
    workflowId: row.workflowId,
    version: row.version,
    locked: row.locked,
    createdAt: row.createdAt,
    createdByName: row.createdByName ?? null,
  }
}

export function versionPageRecord<
  T extends { data: Array<WorkflowVersion & { createdByName?: string | null }> },
>(page: T): Omit<T, 'data'> & { data: VersionListRecord[] } {
  return { ...page, data: page.data.map(versionListRecord) }
}

/** A version's own page: its IR is what it is for; dead columns are not. */
export function versionDetailRecord(row: WorkflowVersion & { createdByName?: string | null }) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    version: row.version,
    ir: row.ir,
    locked: row.locked,
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? null,
    createdAt: row.createdAt,
  }
}

/** A workflow on a list: no env vars, trigger code, dependencies or deploy config. */
export interface WorkflowListRecord {
  id: string
  projectId: string
  workspaceId: string | null
  name: string
  description: string | null
  kind: 'workflow' | 'script'
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

export function workflowListRecord(row: Workflow): WorkflowListRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
