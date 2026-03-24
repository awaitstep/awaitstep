const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const REQUEST_TIMEOUT_MS = 30_000

const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_-]+$/

export interface CFApiConfig {
  accountId: string
  apiToken: string
}

export interface CFInstanceStatus {
  id: string
  status: string
  output?: unknown
  error?: { name: string; message: string }
  created_on?: string
  modified_on?: string
}

export interface CFInstanceListItem {
  id: string
  status: string
  created_on: string
  modified_on: string
}

export interface CFListInstancesOptions {
  page?: number
  per_page?: number
  status?: string
}

function validatePathSegment(value: string, name: string): void {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(`Invalid ${name}: must be alphanumeric with hyphens/underscores only`)
  }
}

export class CloudflareAPI {
  private config: CFApiConfig

  constructor(config: CFApiConfig) {
    validatePathSegment(config.accountId, 'accountId')
    this.config = config
  }

  async verifyToken(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch(`${CF_API_BASE}/user/tokens/verify`, {
          headers: { Authorization: `Bearer ${this.config.apiToken}` },
          signal: controller.signal,
        })
        if (!res.ok) return false
        const data = (await res.json()) as { result?: { status?: string } }
        return data.result?.status === 'active'
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      return false
    }
  }

  async createInstance(
    workflowName: string,
    params?: unknown,
    instanceId?: string,
  ): Promise<{ id: string }> {
    validatePathSegment(workflowName, 'workflowName')
    if (instanceId) validatePathSegment(instanceId, 'instanceId')

    const body: Record<string, unknown> = {}
    if (params !== undefined) body.params = params
    if (instanceId) body.id = instanceId

    const response = await this.request(
      'POST',
      `/accounts/${this.config.accountId}/workflows/${workflowName}/instances`,
      body,
    )
    const result = response.result as { id: string }
    return { id: result.id }
  }

  async getInstanceStatus(workflowName: string, instanceId: string): Promise<CFInstanceStatus> {
    validatePathSegment(workflowName, 'workflowName')
    validatePathSegment(instanceId, 'instanceId')

    const response = await this.request(
      'GET',
      `/accounts/${this.config.accountId}/workflows/${workflowName}/instances/${instanceId}`,
    )
    const result = response.result as CFInstanceStatus
    return {
      id: result.id,
      status: result.status,
      output: result.output,
      error: result.error,
      created_on: result.created_on,
      modified_on: result.modified_on,
    }
  }

  async pauseInstance(workflowName: string, instanceId: string): Promise<void> {
    validatePathSegment(workflowName, 'workflowName')
    validatePathSegment(instanceId, 'instanceId')

    await this.request(
      'PATCH',
      `/accounts/${this.config.accountId}/workflows/${workflowName}/instances/${instanceId}/status`,
      { status: 'pause' },
    )
  }

  async resumeInstance(workflowName: string, instanceId: string): Promise<void> {
    validatePathSegment(workflowName, 'workflowName')
    validatePathSegment(instanceId, 'instanceId')

    await this.request(
      'PATCH',
      `/accounts/${this.config.accountId}/workflows/${workflowName}/instances/${instanceId}/status`,
      { status: 'resume' },
    )
  }

  async terminateInstance(workflowName: string, instanceId: string): Promise<void> {
    validatePathSegment(workflowName, 'workflowName')
    validatePathSegment(instanceId, 'instanceId')

    await this.request(
      'PATCH',
      `/accounts/${this.config.accountId}/workflows/${workflowName}/instances/${instanceId}/status`,
      { status: 'terminate' },
    )
  }

  async listInstances(
    workflowName: string,
    options?: CFListInstancesOptions,
  ): Promise<CFInstanceListItem[]> {
    validatePathSegment(workflowName, 'workflowName')

    const params = new URLSearchParams()
    if (options?.page) params.set('page', String(options.page))
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.status) params.set('status', options.status)

    const qs = params.toString()
    const path = `/accounts/${this.config.accountId}/workflows/${workflowName}/instances${qs ? `?${qs}` : ''}`
    const response = await this.request('GET', path)
    return response.result as CFInstanceListItem[]
  }

  async getInstanceStatuses(
    workflowName: string,
    instanceIds: string[],
  ): Promise<Map<string, CFInstanceStatus>> {
    const results = new Map<string, CFInstanceStatus>()
    if (instanceIds.length === 0) return results

    const settled = await Promise.allSettled(
      instanceIds.map((id) => this.getInstanceStatus(workflowName, id)),
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.id, result.value)
      }
    }

    return results
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ result: unknown; success: boolean }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${CF_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      const data = (await response.json()) as {
        result: unknown
        success: boolean
        errors?: Array<{ message: string }>
      }

      if (!data.success) {
        const errorMsg = data.errors?.[0]?.message ?? `CF API error: ${response.status}`
        throw new Error(errorMsg)
      }

      return data
    } finally {
      clearTimeout(timeout)
    }
  }
}
