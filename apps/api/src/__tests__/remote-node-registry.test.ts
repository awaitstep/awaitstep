import { describe, it, expect, vi, beforeEach } from 'vitest'
import { legacyNodeBundleChecksumInput, nodeBundleChecksumInput } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'
import { createRemoteNodeRegistry, RegistryBundleError } from '../lib/remote-node-registry.js'

const testIndex = {
  version: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  nodes: [
    {
      id: 'test_node',
      name: 'Test',
      description: 'Test node',
      category: 'Utilities',
      tags: [],
      author: 'awaitstep',
      license: 'Apache-2.0',
      providers: ['cloudflare'],
      latest: '1.0.0',
      versions: [{ version: '1.0.0', checksum: '', publishedAt: '2026-01-01T00:00:00Z' }],
    },
  ],
}

const testNodeJson = {
  id: 'test_node',
  name: 'Test',
  version: '1.0.0',
  description: 'Test node',
  category: 'Utilities',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare'],
}

const testTemplate = 'export default async function(ctx) { return {} }'

async function sha256(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hash}`
}

/** The index's `stableChecksum`: sorted keys, what this release verifies. */
function expectedChecksum(
  definition: typeof testNodeJson,
  templates: Record<string, string>,
): Promise<string> {
  return sha256(nodeBundleChecksumInput(definition as NodeDefinition, templates))
}

/** An older index's `checksum`: node.json as written, which released versions verify. */
function legacyChecksum(definition: unknown, templates: Record<string, string>): Promise<string> {
  return sha256(legacyNodeBundleChecksumInput(definition, templates))
}

/** A fetch stub for one node: index.json, node.json and its Cloudflare template. */
function serve(
  versionEntry: Record<string, unknown>,
  nodeJson: unknown = testNodeJson,
  template: { status: number } | string = testTemplate,
) {
  const index = {
    ...testIndex,
    nodes: [
      { ...testIndex.nodes[0], versions: [{ ...testIndex.nodes[0].versions[0], ...versionEntry }] },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/index.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(index) })
      }
      if (url.endsWith('/node.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(nodeJson) })
      }
      if (url.includes('/templates/cloudflare.ts')) {
        return Promise.resolve(
          typeof template === 'string'
            ? { ok: true, status: 200, text: () => Promise.resolve(template) }
            : { ok: false, status: template.status, statusText: 'Server Error' },
        )
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })
    }),
  )
}

/**
 * node.json as the builder writes a merged definition: `version` and
 * `description` last, so the schema's parse (which puts keys in schema order)
 * would serialise differently from the file.
 */
const mergedNodeJson = {
  id: 'test_node',
  name: 'Test',
  category: 'Utilities',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare'],
  version: '1.0.0',
  description: 'Test node',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('createRemoteNodeRegistry', () => {
  describe('getIndex', () => {
    it('fetches and returns the registry index', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(testIndex),
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const index = await registry.getIndex()

      expect(index.nodes).toHaveLength(1)
      expect(index.nodes[0].id).toBe('test_node')
      expect(fetch).toHaveBeenCalledWith('https://example.com/index.json')
    })

    it('caches the index within TTL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(testIndex),
        }),
      )

      const registry = createRemoteNodeRegistry({
        baseUrl: 'https://example.com',
        cacheTtlMs: 60_000,
      })
      await registry.getIndex()
      await registry.getIndex()

      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('says the registry can’t be reached, keeping the fetch failure as detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const error = await registry.getIndex().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RegistryBundleError)
      expect((error as RegistryBundleError).message).toBe(
        'Couldn’t reach the node registry. Try again later.',
      )
      expect((error as RegistryBundleError).detail).toContain('Registry fetch failed: 404')
    })

    it('says the registry can’t be reached when the network fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getIndex()).rejects.toBeInstanceOf(RegistryBundleError)
    })
  })

  describe('getNodeBundle', () => {
    it('fetches and assembles a node bundle', async () => {
      // Pre-compute the checksum the same way the client does
      const checksum = await expectedChecksum(testNodeJson, {
        cloudflare: testTemplate,
      })

      // Update test index with correct checksum
      const indexWithChecksum = {
        ...testIndex,
        nodes: [
          {
            ...testIndex.nodes[0],
            versions: [{ ...testIndex.nodes[0].versions[0], stableChecksum: checksum }],
          },
        ],
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.endsWith('/index.json')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(indexWithChecksum) })
          }
          if (url.endsWith('/node.json')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(testNodeJson) })
          }
          if (url.includes('/templates/cloudflare.ts')) {
            return Promise.resolve({ ok: true, text: () => Promise.resolve(testTemplate) })
          }
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const bundle = await registry.getNodeBundle('test_node', '1.0.0')

      expect(bundle.definition.id).toBe('test_node')
      expect(bundle.templates.cloudflare).toBe(testTemplate)
      expect(bundle.checksum).toBe(checksum)
    })

    it('falls back to default template when provider-specific is missing', async () => {
      const checksum = await expectedChecksum(testNodeJson, { cloudflare: testTemplate })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.endsWith('/index.json')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  ...testIndex,
                  nodes: [
                    {
                      ...testIndex.nodes[0],
                      versions: [{ ...testIndex.nodes[0].versions[0], stableChecksum: checksum }],
                    },
                  ],
                }),
            })
          }
          if (url.endsWith('/node.json')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(testNodeJson) })
          }
          if (url.includes('/templates/')) {
            return Promise.resolve({ ok: false, status: 404 })
          }
          if (url.endsWith('/template.ts')) {
            return Promise.resolve({ ok: true, text: () => Promise.resolve(testTemplate) })
          }
          return Promise.resolve({ ok: false, status: 404 })
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const bundle = await registry.getNodeBundle('test_node', '1.0.0')

      expect(bundle.templates.cloudflare).toBe(testTemplate)
    })

    it('throws when no templates are found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.endsWith('/index.json')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(testIndex) })
          }
          if (url.endsWith('/node.json')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(testNodeJson) })
          }
          return Promise.resolve({ ok: false, status: 404 })
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).rejects.toThrow(
        'The node registry has no code for test_node 1.0.0.',
      )
    })

    it('verifies an index built before the stable checksum, as the live registry still is', async () => {
      const templates = { cloudflare: testTemplate }
      const checksum = await legacyChecksum(mergedNodeJson, templates)
      // Hashing the schema-parsed definition instead of the file would miss.
      expect(checksum).not.toBe(
        await legacyChecksum({ ...testNodeJson, ...mergedNodeJson }, templates),
      )
      serve({ checksum }, mergedNodeJson)
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const bundle = await registry.getNodeBundle('test_node', '1.0.0')
      expect(bundle.definition.id).toBe('test_node')
      expect(bundle.checksum).toBe(await expectedChecksum(mergedNodeJson as never, templates))
    })

    it('refuses a right checksum when the index’s stable checksum is wrong', async () => {
      const templates = { cloudflare: testTemplate }
      serve({
        checksum: await legacyChecksum(testNodeJson, templates),
        stableChecksum: 'sha256:' + '0'.repeat(64),
      })
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).rejects.toBeInstanceOf(
        RegistryBundleError,
      )
    })

    it('says it couldn’t download, not that code is missing, when a template answers 500', async () => {
      const templates = { cloudflare: testTemplate }
      serve({ stableChecksum: await expectedChecksum(testNodeJson, templates) }, testNodeJson, {
        status: 500,
      })
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).rejects.toThrow(
        'Couldn’t download test_node 1.0.0 from the node registry. Try again later.',
      )
    })

    it('checks the stable checksum when the index has both', async () => {
      const templates = { cloudflare: testTemplate }
      serve({
        checksum: 'sha256:' + '0'.repeat(64),
        stableChecksum: await expectedChecksum(testNodeJson, templates),
      })
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).resolves.toBeDefined()
    })

    it('refuses a bundle that matches neither, with a readable reason and the hashes as detail', async () => {
      serve({ checksum: 'sha256:' + '0'.repeat(64) })
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const error = await registry.getNodeBundle('test_node', '1.0.0').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RegistryBundleError)
      expect((error as RegistryBundleError).message).toBe(
        'The node registry’s copy of test_node 1.0.0 doesn’t match its index, so it wasn’t installed. Try again later.',
      )
      expect((error as RegistryBundleError).detail).toMatch(
        /^Checksum mismatch for test_node@1\.0\.0: expected sha256:0{64}, got sha256:[a-f0-9]{64}$/,
      )
    })

    it('says the registry was unreachable when node.json can’t be fetched', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Down' }),
      )
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).rejects.toThrow(
        'Couldn’t download test_node 1.0.0 from the node registry. Try again later.',
      )
    })

    it('refuses an index version that isn’t semver before fetching anything', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      const error = await registry
        .getNodeBundle('test_node', '../../x' + 'y'.repeat(500))
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RegistryBundleError)
      expect((error as RegistryBundleError).message).toBe(
        'The node registry lists a node it can’t provide.',
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuses a definition the checksum can’t be computed over, in words', async () => {
      const withConstructor = {
        ...testNodeJson,
        configSchema: { constructor: { type: 'string', label: 'x' } },
      }
      serve({ checksum: 'sha256:' + '0'.repeat(64) }, withConstructor)
      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getNodeBundle('test_node', '1.0.0')).rejects.toThrow(
        'The node registry’s test_node 1.0.0 isn’t a valid node.',
      )
    })
  })
})
