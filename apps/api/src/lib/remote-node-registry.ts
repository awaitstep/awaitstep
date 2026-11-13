import {
  legacyNodeBundleChecksumInput,
  nodeBundleChecksumInput,
  nodeDefinitionSchema,
} from '@awaitstep/ir'
import type { NodeDefinition, Provider, NodeBundle } from '@awaitstep/ir'

export interface RegistryVersionEntry {
  version: string
  /** Over `node.json` as written, in its own key order: what older releases verify. */
  checksum: string
  /** Over the definition with sorted keys; checked first when the index has it. */
  stableChecksum?: string
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

/**
 * The registry could not hand over a usable node: unreachable, invalid, or
 * not matching its index. `message` is a sentence for the person installing;
 * `detail` (URLs, checksums) is for the log only.
 */
export class RegistryBundleError extends Error {
  readonly detail: string
  constructor(message: string, detail: string) {
    super(message)
    this.name = 'RegistryBundleError'
    this.detail = detail
  }
}

const SEMVER = /^\d+\.\d+\.\d+$/
const NODE_ID = /^[a-z][a-z0-9_-]{0,99}$/

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
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

  /** A file the registry may not have: null only when it answers 404; any other failure throws. */
  async function fetchText(url: string): Promise<string | null> {
    const res = await fetch(url)
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(`Registry fetch failed: ${res.status} ${res.statusText} (${url})`)
    }
    return res.text()
  }

  /** `work`'s result, with a failure to reach the registry (or a bad answer) said in words. */
  async function fromRegistry<T>(message: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (err) {
      throw new RegistryBundleError(message, err instanceof Error ? err.message : String(err))
    }
  }

  return {
    async getIndex(): Promise<RegistryIndex> {
      const now = Date.now()
      if (cachedIndex && now - cachedAt < cacheTtlMs) {
        return cachedIndex
      }
      cachedIndex = await fromRegistry('Couldn’t reach the node registry. Try again later.', () =>
        fetchJson<RegistryIndex>(`${baseUrl}/index.json`),
      )
      cachedAt = now
      return cachedIndex
    },

    async getNodeBundle(nodeId: string, version: string): Promise<NodeBundle> {
      // The version can come from the index (a node's `latest`): only a plain
      // semver goes into a URL or a message.
      if (!SEMVER.test(version) || !NODE_ID.test(nodeId)) {
        throw new RegistryBundleError(
          'The node registry lists a node it can’t provide.',
          `Unusable node id or version: ${JSON.stringify(nodeId).slice(0, 120)}@${JSON.stringify(version).slice(0, 60)}`,
        )
      }
      const versionBase = `${baseUrl}/nodes/${nodeId}/${version}`
      const label = `${nodeId} ${version}`

      const unreachable = `Couldn’t download ${label} from the node registry. Try again later.`
      const rawDefinition = await fromRegistry(unreachable, () =>
        fetchJson<unknown>(`${versionBase}/node.json`),
      )
      const parsedDefinition = nodeDefinitionSchema.safeParse(rawDefinition)
      if (!parsedDefinition.success) {
        throw new RegistryBundleError(
          `The node registry’s ${label} isn’t a valid node.`,
          `Invalid node definition for ${nodeId}@${version}`,
        )
      }
      const definition = parsedDefinition.data as NodeDefinition

      const templates: Partial<Record<Provider, string>> = {}
      await fromRegistry(unreachable, async () => {
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
      })

      if (Object.values(templates).every((v) => v === undefined || v === null)) {
        throw new RegistryBundleError(
          `The node registry has no code for ${label}.`,
          `No templates found for node ${nodeId}@${version}`,
        )
      }

      const index = await this.getIndex()
      const nodeEntry = index.nodes.find((n) => n.id === nodeId)
      const versionEntry = nodeEntry?.versions.find((v) => v.version === version)
      if (!versionEntry?.checksum && !versionEntry?.stableChecksum) {
        throw new RegistryBundleError(
          `The node registry can’t vouch for ${label}, so it wasn’t installed.`,
          `Registry index has no checksum for ${nodeId}@${version}`,
        )
      }
      // An index from this release onward carries the sorted-key checksum; an
      // older one only the checksum over node.json as written.
      // stableStringify refuses some keys (`constructor`, `prototype`) the schema lets through.
      const invalid = `The node registry’s ${label} isn’t a valid node.`
      const stable = await fromRegistry(invalid, () =>
        sha256(nodeBundleChecksumInput(definition, templates)),
      )
      const [expected, actual] = versionEntry.stableChecksum
        ? [versionEntry.stableChecksum, stable]
        : [
            versionEntry.checksum,
            await sha256(legacyNodeBundleChecksumInput(rawDefinition, templates)),
          ]
      if (expected !== actual) {
        throw new RegistryBundleError(
          `The node registry’s copy of ${label} doesn’t match its index, so it wasn’t installed. Try again later.`,
          `Checksum mismatch for ${nodeId}@${version}: expected ${expected}, got ${actual}`,
        )
      }

      return {
        definition,
        templates,
        bundledAt: new Date().toISOString(),
        checksum: stable,
      }
    },
  }
}
