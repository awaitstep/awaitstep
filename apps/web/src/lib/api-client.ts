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

export interface ConnectionSummary {
  id: string
  name: string
  accountId: string
  apiToken: string
  createdAt: string
}

export const api = {
  listWorkflows(): Promise<WorkflowSummary[]> {
    return request('/workflows')
  },

  getWorkflow(id: string): Promise<WorkflowSummary> {
    return request(`/workflows/${id}`)
  },

  createWorkflow(data: { name: string; description?: string }): Promise<WorkflowSummary> {
    return request('/workflows', { method: 'POST', body: JSON.stringify(data) })
  },

  updateWorkflow(id: string, data: { name?: string; description?: string }): Promise<WorkflowSummary> {
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

  createConnection(data: { name: string; accountId: string; apiToken: string }): Promise<ConnectionSummary> {
    return request('/connections', { method: 'POST', body: JSON.stringify(data) })
  },

  deleteConnection(id: string): Promise<void> {
    return request(`/connections/${id}`, { method: 'DELETE' })
  },

  listDeployments(workflowId: string): Promise<{ id: string; workflowId: string; versionId: string; connectionId: string; workerName: string; workerUrl: string | null; status: string; error: string | null; createdAt: string }[]> {
    return request(`/workflows/${workflowId}/deployments`)
  },

  listAllDeployments(): Promise<{ id: string; workflowId: string; versionId: string; connectionId: string; workerName: string; workerUrl: string | null; status: string; error: string | null; createdAt: string }[]> {
    return request('/deployments')
  },

  takedownDeployment(workflowId: string, connectionId: string): Promise<{ success: boolean; error?: string }> {
    return request(`/workflows/${workflowId}/takedown`, { method: 'POST', body: JSON.stringify({ connectionId }) })
  },

  verifyToken(apiToken: string): Promise<{ valid: boolean; accounts: { id: string; name: string }[] }> {
    return request('/connections/verify-token', { method: 'POST', body: JSON.stringify({ apiToken }) })
  },

  getSelfHostedConnection(): Promise<{ configured: boolean; registered?: boolean; accountId?: string; name?: string }> {
    return request('/connections/self-hosted')
  },

  registerSelfHostedConnection(): Promise<ConnectionSummary> {
    return request('/connections/self-hosted', { method: 'POST' })
  },
}
