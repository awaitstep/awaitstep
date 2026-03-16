import type { CFApiConfig } from './api.js'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const REQUEST_TIMEOUT_MS = 30_000

export interface KVNamespace {
  id: string
  title: string
}

export interface KVKeyInfo {
  name: string
  metadata?: unknown
  expiration?: number
}

export interface D1Database {
  uuid: string
  name: string
  num_tables: number
  file_size: number
  created_at: string
}

export interface D1QueryResult {
  columns: string[]
  rows: unknown[][]
  meta: { changes: number; rows_read: number; rows_written: number }
}

export interface R2Bucket {
  name: string
  creation_date: string
}

export interface R2Object {
  key: string
  size: number
  uploaded: string
  etag: string
}

export class CloudflareResourcesAPI {
  private config: CFApiConfig

  constructor(config: CFApiConfig) {
    this.config = config
  }

  // ── KV ──

  async listKVNamespaces(): Promise<KVNamespace[]> {
    const data = await this.request('GET', `/accounts/${this.config.accountId}/storage/kv/namespaces`)
    return data.result as KVNamespace[]
  }

  async createKVNamespace(title: string): Promise<KVNamespace> {
    const data = await this.request('POST', `/accounts/${this.config.accountId}/storage/kv/namespaces`, { title })
    return data.result as KVNamespace
  }

  async listKVKeys(namespaceId: string, options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ keys: KVKeyInfo[]; cursor?: string }> {
    const params = new URLSearchParams()
    if (options?.prefix) params.set('prefix', options.prefix)
    if (options?.cursor) params.set('cursor', options.cursor)
    if (options?.limit) params.set('limit', String(options.limit))
    const qs = params.toString()
    const data = await this.request('GET', `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/keys${qs ? `?${qs}` : ''}`)
    const resultInfo = (data as { result_info?: { cursor?: string } }).result_info
    return {
      keys: data.result as KVKeyInfo[],
      cursor: resultInfo?.cursor,
    }
  }

  async getKVValue(namespaceId: string, key: string): Promise<string> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
      {
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
    if (!response.ok) throw new Error(`KV get failed: ${response.status}`)
    return response.text()
  }

  // ── D1 ──

  async listD1Databases(): Promise<D1Database[]> {
    const data = await this.request('GET', `/accounts/${this.config.accountId}/d1/database`)
    return data.result as D1Database[]
  }

  async createD1Database(name: string): Promise<D1Database> {
    const data = await this.request('POST', `/accounts/${this.config.accountId}/d1/database`, { name })
    return data.result as D1Database
  }

  async queryD1(databaseId: string, sql: string, params?: unknown[]): Promise<D1QueryResult[]> {
    const body: Record<string, unknown> = { sql }
    if (params?.length) body.params = params
    const data = await this.request('POST', `/accounts/${this.config.accountId}/d1/database/${databaseId}/query`, body)
    return data.result as D1QueryResult[]
  }

  // ── R2 ──

  async listR2Buckets(): Promise<R2Bucket[]> {
    const data = await this.request('GET', `/accounts/${this.config.accountId}/r2/buckets`)
    return (data.result as { buckets: R2Bucket[] }).buckets
  }

  async listR2Objects(bucketName: string, options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: R2Object[]; cursor?: string }> {
    const params = new URLSearchParams()
    if (options?.prefix) params.set('prefix', options.prefix)
    if (options?.cursor) params.set('cursor', options.cursor)
    if (options?.limit) params.set('per_page', String(options.limit))
    const qs = params.toString()
    const data = await this.request('GET', `/accounts/${this.config.accountId}/r2/buckets/${bucketName}/objects${qs ? `?${qs}` : ''}`)
    const r2ResultInfo = (data as { result_info?: { cursor?: string } }).result_info
    return {
      objects: (data.result as R2Object[]) ?? [],
      cursor: r2ResultInfo?.cursor,
    }
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
        result_info?: unknown
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
