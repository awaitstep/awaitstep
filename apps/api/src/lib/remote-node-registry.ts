import type { NodeDefinition, Provider, NodeBundle } from '@awaitstep/ir'

export interface RegistryVersionEntry {
  version: string
  checksum: string
  publishedAt: string
  deprecated?: boolean
}

export interface RegistryNodeEntry {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  icon?: string
  author: string
  license: string
  providers: Provider[]
  latest: string
  versions: RegistryVersionEntry[]
}

export interface RegistryIndex {
  version: number
  generatedAt: string
  nodes: RegistryNodeEntry[]
}

export interface RemoteNodeRegistryConfig {
  baseUrl: string
  cacheTtlMs?: number
}

export interface RemoteNodeRegistry {
  getIndex(): Promise<RegistryIndex>
  getNodeBundle(nodeId: string, version: string): Promise<NodeBundle>
}

export function createRemoteNodeRegistry(config: RemoteNodeRegistryConfig): RemoteNodeRegistry {
  const { baseUrl, cacheTtlMs = 300_000 } = config
  let cachedIndex: RegistryIndex | null = null
  let cachedAt = 0

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Registry fetch failed: ${res.status} ${res.statusText} (${url})`)
    }
    return res.json() as Promise<T>
  }

  async function fetchText(url: string): Promise<string | null> {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.text()
  }

  return {
    async getIndex(): Promise<RegistryIndex> {
      const now = Date.now()
      if (cachedIndex && now - cachedAt < cacheTtlMs) {
        return cachedIndex
      }
      cachedIndex = await fetchJson<RegistryIndex>(`${baseUrl}/index.json`)
      cachedAt = now
      return cachedIndex
    },

    async getNodeBundle(nodeId: string, version: string): Promise<NodeBundle> {
      const versionBase = `${baseUrl}/nodes/${nodeId}/${version}`

      const definition = await fetchJson<NodeDefinition>(`${versionBase}/node.json`)

      const templates: Partial<Record<Provider, string>> = {}
      for (const provider of definition.providers) {
        const providerTemplate = await fetchText(`${versionBase}/templates/${provider}.ts`)
        if (providerTemplate) {
          templates[provider] = providerTemplate
          continue
        }
        const defaultTemplate = await fetchText(`${versionBase}/template.ts`)
        if (defaultTemplate) {
          templates[provider] = defaultTemplate
        }
      }

      if (Object.values(templates).every((v) => v === undefined || v === null)) {
        throw new Error(`No templates found for node ${nodeId}@${version}`)
      }

      const checksumInput = JSON.stringify({ definition, templates })
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(checksumInput),
      )
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const index = await this.getIndex()
      const nodeEntry = index.nodes.find((n) => n.id === nodeId)
      const versionEntry = nodeEntry?.versions.find((v) => v.version === version)
      if (versionEntry?.checksum && versionEntry.checksum !== `sha256:${hash}`) {
        throw new Error(
          `Checksum mismatch for ${nodeId}@${version}: expected ${versionEntry.checksum}, got sha256:${hash}`,
        )
      }

      return {
        definition,
        templates,
        bundledAt: new Date().toISOString(),
        checksum: `sha256:${hash}`,
      }
    },
  }
}
