import { useOrgStore } from '../stores/org-store'

const API_BASE = '/api'

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

  listWorkflows(): Promise<WorkflowSummary[]> {
    return request(withProject('/workflows'))
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

  listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return request(withProject(`/workflows/${workflowId}/versions`))
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

  listConnections(): Promise<ConnectionSummary[]> {
    return request(withOrg('/connections'))
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

  listDeployments(workflowId: string): Promise<DeploymentSummary[]> {
    return request(withProject(`/workflows/${workflowId}/deployments`))
  },

  listAllDeployments(): Promise<DeploymentSummary[]> {
    return request(withProject('/deployments'))
  },

  listAllRuns(): Promise<RunSummary[]> {
    return request(withProject('/runs'))
  },

  listWorkflowRuns(workflowId: string): Promise<RunSummary[]> {
    return request(withProject(`/workflows/${workflowId}/runs`))
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

  listEnvVars(): Promise<EnvVarSummary[]> {
    return request(withOrg('/env-vars'))
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

  listApiKeys(): Promise<ApiKeySummary[]> {
    return request(withOrg('/api-keys'))
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

  // Projects (org-scoped)

  listProjects(): Promise<ProjectSummary[]> {
    return request(withOrg('/projects'))
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
