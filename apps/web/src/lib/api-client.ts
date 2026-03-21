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

export interface WorkflowSummary {
  id: string
  name: string
  description?: string
  envVars?: string | null
  triggerCode?: string | null
  dependencies?: string | null
  currentVersionId?: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  version: number
  ir: string
  generatedCode: string
  createdAt: string
}

export interface VersionSummary {
  id: string
  version: number
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
  listWorkflows(): Promise<WorkflowSummary[]> {
    return request('/workflows')
  },

  getWorkflow(id: string): Promise<WorkflowSummary> {
    return request(`/workflows/${id}`)
  },

  getWorkflowFull(id: string, versionId?: string): Promise<WorkflowFull> {
    const params = versionId ? `?version=${versionId}` : ''
    return request(`/workflows/${id}/full${params}`)
  },

  createWorkflow(data: { name: string; description?: string }): Promise<WorkflowSummary> {
    return request('/workflows', { method: 'POST', body: JSON.stringify(data) })
  },

  updateWorkflow(id: string, data: { name?: string; description?: string; envVars?: { name: string; value: string; isSecret?: boolean }[]; triggerCode?: string; dependencies?: Record<string, string> }): Promise<WorkflowSummary> {
    return request(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteWorkflow(id: string): Promise<void> {
    return request(`/workflows/${id}`, { method: 'DELETE' })
  },

  listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return request(`/workflows/${workflowId}/versions`)
  },

  getVersion(workflowId: string, versionId: string): Promise<WorkflowVersion> {
    return request(`/workflows/${workflowId}/versions/${versionId}`)
  },

  createVersion(workflowId: string, data: { ir: unknown }): Promise<WorkflowVersion> {
    return request(`/workflows/${workflowId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  listConnections(): Promise<ConnectionSummary[]> {
    return request('/connections')
  },

  createConnection(data: { name: string; provider: string; credentials: Record<string, string> }): Promise<ConnectionSummary> {
    return request('/connections', { method: 'POST', body: JSON.stringify(data) })
  },

  updateConnection(id: string, data: { name?: string; credentials?: Record<string, string> }): Promise<ConnectionSummary> {
    return request(`/connections/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteConnection(id: string): Promise<void> {
    return request(`/connections/${id}`, { method: 'DELETE' })
  },

  listDeployments(workflowId: string): Promise<DeploymentSummary[]> {
    return request(`/workflows/${workflowId}/deployments`)
  },

  listAllDeployments(): Promise<DeploymentSummary[]> {
    return request('/deployments')
  },

  listAllRuns(): Promise<RunSummary[]> {
    return request('/runs')
  },

  takedownDeployment(workflowId: string, connectionId: string): Promise<{ success: boolean; error?: string }> {
    return request(`/workflows/${workflowId}/takedown`, { method: 'POST', body: JSON.stringify({ connectionId }) })
  },

  verifyCredentials(provider: string, credentials: Record<string, string>): Promise<{ valid: boolean; accounts: { id: string; name: string }[] }> {
    return request('/connections/verify-token', { method: 'POST', body: JSON.stringify({ provider, credentials }) })
  },

  getSelfHostedConnection(): Promise<{ configured: boolean; registered?: boolean; accountId?: string; name?: string }> {
    return request('/connections/self-hosted')
  },

  registerSelfHostedConnection(): Promise<ConnectionSummary> {
    return request('/connections/self-hosted', { method: 'POST' })
  },

  triggerWorkflow(workflowId: string, data: { connectionId: string; params?: unknown }): Promise<{ id: string; instanceId: string; status: string }> {
    return request(`/workflows/${workflowId}/trigger`, { method: 'POST', body: JSON.stringify(data) })
  },

  listEnvVars(): Promise<EnvVarSummary[]> {
    return request('/env-vars')
  },

  createEnvVar(data: { name: string; value: string; isSecret: boolean }): Promise<EnvVarSummary> {
    return request('/env-vars', { method: 'POST', body: JSON.stringify(data) })
  },

  updateEnvVar(id: string, data: { name?: string; value?: string; isSecret?: boolean }): Promise<EnvVarSummary> {
    return request(`/env-vars/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  deleteEnvVar(id: string): Promise<void> {
    return request(`/env-vars/${id}`, { method: 'DELETE' })
  },

  listApiKeys(): Promise<ApiKeySummary[]> {
    return request('/api-keys')
  },

  createApiKey(data: { name: string; scopes: string[]; expiresAt?: string | null }): Promise<ApiKeyCreated> {
    return request('/api-keys', { method: 'POST', body: JSON.stringify(data) })
  },

  revokeApiKey(id: string): Promise<ApiKeySummary> {
    return request(`/api-keys/${id}`, { method: 'DELETE' })
  },
}
