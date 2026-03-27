import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'

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

    it('throws on fetch failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      )

      const registry = createRemoteNodeRegistry({ baseUrl: 'https://example.com' })
      await expect(registry.getIndex()).rejects.toThrow('Registry fetch failed')
    })
  })

  describe('getNodeBundle', () => {
    it('fetches and assembles a node bundle', async () => {
      // Pre-compute the checksum the same way the client does
      const definition = testNodeJson
      const templates = { cloudflare: testTemplate }
      const checksumInput = JSON.stringify({ definition, templates })
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(checksumInput),
      )
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      const expectedChecksum = `sha256:${hash}`

      // Update test index with correct checksum
      const indexWithChecksum = {
        ...testIndex,
        nodes: [
          {
            ...testIndex.nodes[0],
            versions: [{ ...testIndex.nodes[0].versions[0], checksum: expectedChecksum }],
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
      expect(bundle.checksum).toBe(expectedChecksum)
    })

    it('falls back to default template when provider-specific is missing', async () => {
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
                      versions: [{ ...testIndex.nodes[0].versions[0], checksum: '' }],
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
        'No templates found',
      )
    })
  })
})
