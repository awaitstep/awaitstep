import { useOrgStore } from '../stores/org-store'

const API_BASE = '/api'

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
}

export interface PaginationOptions {
  cursor?: string
  limit?: number
}

function withPagination(path: string, opts?: PaginationOptions): string {
  if (!opts) return path
  const params = new URLSearchParams()
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (opts.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  if (!qs) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${qs}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }

  return res.json()
}

function withOrg(path: string): string {
  const organizationId = useOrgStore.getState().activeOrganizationId
  if (!organizationId) throw new Error('No active organization selected')
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}organizationId=${organizationId}`
}

function withProject(path: string, overrideProjectId?: string): string {
  const projectId = overrideProjectId ?? useOrgStore.getState().activeProjectId
  if (!projectId) throw new Error('No active project selected')
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}projectId=${projectId}`
}

export function projectUrl(path: string): string {
  return `${API_BASE}${withProject(path)}`
}

export interface WorkflowSummary {
  id: string
  name: string
  description?: string
  envVars?: string | null
  triggerCode?: string | null
  dependencies?: string | null
  currentVersionId?: string | null
  deployStatus?: string | null
  deployVersionId?: string | null
  lastRunStatus?: string | null
  lastRunAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  version: number
  ir: string
  locked: number
  createdAt: string
}

export interface VersionSummary {
  id: string
  version: number
  locked: number
  createdAt: string
}

export interface DeploymentSummary {
  id: string
  workflowId: string
  versionId: string
  connectionId: string | null
  serviceName: string
  serviceUrl: string | null
  status: string
  error: string | null
  createdAt: string
}

export interface WorkflowFull {
  workflow: WorkflowSummary
  version: WorkflowVersion | null
  versions: VersionSummary[]
  activeDeployment: DeploymentSummary | null
}

export interface RunSummary {
  id: string
  workflowId: string
  versionId: string
  connectionId: string | null
  instanceId: string
  status: string
  output: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionSummary {
  id: string
  name: string
  provider: string
  credentials: Record<string, string>
  createdAt: string
}

export interface EnvVarSummary {
  id: string
  name: string
  value: string
  isSecret: boolean
  createdAt: string
  updatedAt: string
}

export interface ApiKeySummary {
  id: string
  name: string
  keyPrefix: string
  scopes: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface ApiKeyCreated extends ApiKeySummary {
  key: string
}

export const api = {
  // Project-scoped endpoints (require active project)

  listWorkflows(opts?: PaginationOptions): Promise<PaginatedResponse<WorkflowSummary>> {
    return request(withPagination(withProject('/workflows'), opts))
  },

  getWorkflow(id: string): Promise<WorkflowSummary> {
    return request(withProject(`/workflows/${id}`))
  },

  getWorkflowFull(id: string, versionId?: string): Promise<WorkflowFull> {
    const params = versionId ? `?version=${versionId}` : ''
    return request(withProject(`/workflows/${id}/full${params}`))
  },

  createWorkflow(data: { name: string; description?: string }): Promise<WorkflowSummary> {
    return request(withProject('/workflows'), { method: 'POST', body: JSON.stringify(data) })
  },

  updateWorkflow(
    id: string,
    data: {
      name?: string
      description?: string
      envVars?: { name: string; value: string; isSecret?: boolean }[]
      triggerCode?: string
      dependencies?: Record<string, string>
    },
  ): Promise<WorkflowSummary> {
    return request(withProject(`/workflows/${id}`), { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteWorkflow(id: string): Promise<void> {
    return request(withProject(`/workflows/${id}`), { method: 'DELETE' })
  },

  listVersions(
    workflowId: string,
    opts?: PaginationOptions,
  ): Promise<PaginatedResponse<WorkflowVersion>> {
    return request(withPagination(withProject(`/workflows/${workflowId}/versions`), opts))
  },

  getVersion(workflowId: string, versionId: string): Promise<WorkflowVersion> {
    return request(withProject(`/workflows/${workflowId}/versions/${versionId}`))
  },

  createVersion(workflowId: string, data: { ir: unknown }): Promise<WorkflowVersion> {
    return request(withProject(`/workflows/${workflowId}/versions`), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  lockVersion(workflowId: string, versionId: string, locked: boolean): Promise<WorkflowVersion> {
    return request(withProject(`/workflows/${workflowId}/versions/${versionId}`), {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    })
  },

  revertToVersion(workflowId: string, versionId: string): Promise<WorkflowVersion> {
    return request(withProject(`/workflows/${workflowId}/versions/${versionId}/revert`), {
      method: 'POST',
    })
  },

  deleteVersion(workflowId: string, versionId: string): Promise<void> {
    return request(withProject(`/workflows/${workflowId}/versions/${versionId}`), {
      method: 'DELETE',
    })
  },

  // Org-scoped endpoints (require active organization)

  listConnections(opts?: PaginationOptions): Promise<PaginatedResponse<ConnectionSummary>> {
    return request(withPagination(withOrg('/connections'), opts))
  },

  createConnection(data: {
    name: string
    provider: string
    credentials: Record<string, string>
  }): Promise<ConnectionSummary> {
    return request(withOrg('/connections'), { method: 'POST', body: JSON.stringify(data) })
  },

  updateConnection(
    id: string,
    data: { name?: string; credentials?: Record<string, string> },
  ): Promise<ConnectionSummary> {
    return request(withOrg(`/connections/${id}`), { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteConnection(id: string): Promise<void> {
    return request(withOrg(`/connections/${id}`), { method: 'DELETE' })
  },

  listDeployments(
    workflowId: string,
    opts?: PaginationOptions,
  ): Promise<PaginatedResponse<DeploymentSummary>> {
    return request(withPagination(withProject(`/workflows/${workflowId}/deployments`), opts))
  },

  listAllDeployments(opts?: PaginationOptions): Promise<PaginatedResponse<DeploymentSummary>> {
    return request(withPagination(withProject('/deployments'), opts))
  },

  listAllRuns(opts?: PaginationOptions): Promise<PaginatedResponse<RunSummary>> {
    return request(withPagination(withProject('/runs'), opts))
  },

  listWorkflowRuns(
    workflowId: string,
    opts?: PaginationOptions,
  ): Promise<PaginatedResponse<RunSummary>> {
    return request(withPagination(withProject(`/workflows/${workflowId}/runs`), opts))
  },

  getWorkflowRun(workflowId: string, runId: string): Promise<RunSummary> {
    return request(withProject(`/workflows/${workflowId}/runs/${runId}`))
  },

  controlWorkflowRun(
    workflowId: string,
    runId: string,
    action: 'pause' | 'resume' | 'terminate',
  ): Promise<RunSummary> {
    return request(withProject(`/workflows/${workflowId}/runs/${runId}/${action}`), {
      method: 'POST',
    })
  },

  takedownDeployment(
    workflowId: string,
    connectionId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return request(withProject(`/workflows/${workflowId}/takedown`), {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    })
  },

  verifyCredentials(
    provider: string,
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; accounts: { id: string; name: string }[] }> {
    return request(withOrg('/connections/verify-token'), {
      method: 'POST',
      body: JSON.stringify({ provider, credentials }),
    })
  },

  triggerWorkflow(
    workflowId: string,
    data: { connectionId: string; params?: unknown },
  ): Promise<{ id: string; instanceId: string; status: string }> {
    return request(withProject(`/workflows/${workflowId}/trigger`), {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Local dev
  startLocalDev(
    workflowId: string,
  ): Promise<{ status: string; port: number; url: string; pid: number }> {
    return request(withProject(`/workflows/${workflowId}/local-dev/start`), {
      method: 'POST',
      body: '{}',
    })
  },

  stopLocalDev(workflowId: string): Promise<{ status: string }> {
    return request(withProject(`/workflows/${workflowId}/local-dev/stop`), { method: 'POST' })
  },

  triggerLocalDev(workflowId: string, params?: unknown): Promise<unknown> {
    return request(withProject(`/workflows/${workflowId}/local-dev/trigger`), {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    })
  },

  getLocalDevInstance(workflowId: string, instanceId: string): Promise<unknown> {
    return request(
      withProject(`/workflows/${workflowId}/local-dev/instance/${encodeURIComponent(instanceId)}`),
    )
  },

  getLocalDevLogs(
    workflowId: string,
    since?: number,
  ): Promise<{ timestamp: number; stream: 'stdout' | 'stderr'; text: string }[]> {
    const params = since ? `?since=${since}` : ''
    return request(withProject(`/workflows/${workflowId}/local-dev/logs${params}`))
  },

  listEnvVars(opts?: PaginationOptions): Promise<PaginatedResponse<EnvVarSummary>> {
    return request(withPagination(withOrg('/env-vars'), opts))
  },

  createEnvVar(data: { name: string; value: string; isSecret: boolean }): Promise<EnvVarSummary> {
    return request(withOrg('/env-vars'), { method: 'POST', body: JSON.stringify(data) })
  },

  updateEnvVar(
    id: string,
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVarSummary> {
    return request(withOrg(`/env-vars/${id}`), { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteEnvVar(id: string): Promise<void> {
    return request(withOrg(`/env-vars/${id}`), { method: 'DELETE' })
  },

  listApiKeys(opts?: PaginationOptions): Promise<PaginatedResponse<ApiKeySummary>> {
    return request(withPagination(withOrg('/api-keys'), opts))
  },

  createApiKey(data: {
    name: string
    projectId: string
    scopes: string[]
    expiresAt?: string | null
  }): Promise<ApiKeyCreated> {
    return request(withOrg('/api-keys'), { method: 'POST', body: JSON.stringify(data) })
  },

  revokeApiKey(id: string): Promise<ApiKeySummary> {
    return request(withOrg(`/api-keys/${id}`), { method: 'DELETE' })
  },

  // Marketplace (org-scoped)

  browseMarketplace(): Promise<MarketplaceBrowseResponse> {
    return request(withOrg('/marketplace'))
  },

  getMarketplaceNode(nodeId: string): Promise<MarketplaceNodeDetail> {
    return request(withOrg(`/marketplace/${nodeId}`))
  },

  installNode(nodeId: string, version?: string): Promise<InstalledNodeSummary> {
    return request(withOrg('/marketplace/install'), {
      method: 'POST',
      body: JSON.stringify({ nodeId, version }),
    })
  },

  uninstallNode(nodeId: string): Promise<void> {
    return request(withOrg('/marketplace/uninstall'), {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    })
  },

  updateNode(nodeId: string, version?: string): Promise<InstalledNodeSummary> {
    return request(withOrg('/marketplace/update'), {
      method: 'POST',
      body: JSON.stringify({ nodeId, version }),
    })
  },

  listInstalledNodes(opts?: PaginationOptions): Promise<PaginatedResponse<InstalledNodeSummary>> {
    return request(withPagination(withOrg('/marketplace/installed'), opts))
  },

  // Projects (org-scoped)

  listProjects(opts?: PaginationOptions): Promise<PaginatedResponse<ProjectSummary>> {
    return request(withPagination(withOrg('/projects'), opts))
  },

  createProject(data: {
    name: string
    slug: string
    description?: string
  }): Promise<ProjectSummary> {
    return request(withOrg('/projects'), { method: 'POST', body: JSON.stringify(data) })
  },

  updateProject(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<ProjectSummary> {
    return request(withOrg(`/projects/${id}`), { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteProject(id: string): Promise<void> {
    return request(withOrg(`/projects/${id}`), { method: 'DELETE' })
  },
}

export interface ProjectSummary {
  id: string
  organizationId: string
  name: string
  slug: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketplaceNodeEntry {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  icon?: string
  author: string
  license: string
  providers: string[]
  latest: string
  versions: { version: string; publishedAt: string; deprecated?: boolean }[]
  installed: boolean
  installedVersion: string | null
}

export interface MarketplaceBrowseResponse {
  nodes: MarketplaceNodeEntry[]
}

export type MarketplaceNodeDetail = MarketplaceNodeEntry

export interface InstalledNodeSummary {
  id: string
  organizationId: string
  nodeId: string
  version: string
  bundle: string
  installedBy: string
  installedAt: string
  updatedAt: string
}
