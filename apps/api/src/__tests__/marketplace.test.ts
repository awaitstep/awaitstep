import { describe, it, expect, beforeEach } from 'vitest'
import type { RemoteNodeRegistry } from '../lib/remote-node-registry.js'
import type { NodeBundle, NodeDefinition } from '@awaitstep/ir'
import { createTestApp, resetStore, TEST_ORG_ID } from './helpers.js'

const testDefinition: NodeDefinition = {
  id: 'test_node',
  name: 'Test Node',
  version: '1.0.0',
  description: 'A test node',
  category: 'Utilities',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare'],
}

const testBundle: NodeBundle = {
  definition: testDefinition,
  templates: { cloudflare: 'export default async function(ctx) { return {} }' },
  bundledAt: new Date().toISOString(),
  checksum: 'sha256:' + 'a'.repeat(64),
}

const mockRegistry: RemoteNodeRegistry = {
  async getIndex() {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'test_node',
          name: 'Test Node',
          description: 'A test node',
          category: 'Utilities',
          tags: ['test'],
          author: 'awaitstep',
          license: 'Apache-2.0',
          providers: ['cloudflare'],
          latest: '1.0.0',
          versions: [
            {
              version: '1.0.0',
              checksum: testBundle.checksum,
              publishedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    }
  },
  async getNodeBundle() {
    return testBundle
  },
}

function url(path: string) {
  return `/api/marketplace${path}?organizationId=${TEST_ORG_ID}`
}

describe('marketplace', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp({ remoteNodeRegistry: mockRegistry })
  })

  describe('GET /marketplace', () => {
    it('returns available nodes with installed flag', async () => {
      const res = await app.request(url(''))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.nodes).toHaveLength(1)
      expect(body.nodes[0].id).toBe('test_node')
      expect(body.nodes[0].installed).toBe(false)
      expect(body.nodes[0].installedVersion).toBeNull()
    })

    it('returns 503 when registry is not configured', async () => {
      const appNoRegistry = createTestApp()
      const res = await appNoRegistry.request(url(''))
      expect(res.status).toBe(503)
    })
  })

  describe('POST /marketplace/install', () => {
    it('installs a node', async () => {
      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.nodeId).toBe('test_node')
      expect(body.version).toBe('1.0.0')
    })

    it('installs a specific version', async () => {
      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node', version: '1.0.0' }),
      })
      expect(res.status).toBe(201)
    })

    it('returns 409 when already installed', async () => {
      await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })

      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })
      expect(res.status).toBe(409)
    })

    it('returns 404 for unknown node', async () => {
      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'nonexistent' }),
      })
      expect(res.status).toBe(404)
    })

    it('rejects invalid nodeId format', async () => {
      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: '../path-traversal' }),
      })
      expect(res.status).toBe(422)
    })

    it('rejects invalid version format', async () => {
      const res = await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node', version: 'not-semver' }),
      })
      expect(res.status).toBe(422)
    })
  })

  describe('POST /marketplace/uninstall', () => {
    it('uninstalls an installed node', async () => {
      await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })

      const res = await app.request(url('/uninstall'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })
      expect(res.status).toBe(200)
    })

    it('returns 404 when node is not installed', async () => {
      const res = await app.request(url('/uninstall'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /marketplace/installed', () => {
    it('lists installed nodes', async () => {
      await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })

      const res = await app.request(url('/installed'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].nodeId).toBe('test_node')
    })

    it('returns empty array when nothing installed', async () => {
      const res = await app.request(url('/installed'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(0)
    })
  })

  describe('browse with installed flag', () => {
    it('marks installed nodes in browse response', async () => {
      await app.request(url('/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: 'test_node' }),
      })

      const res = await app.request(url(''))
      const body = await res.json()
      expect(body.nodes[0].installed).toBe(true)
      expect(body.nodes[0].installedVersion).toBe('1.0.0')
    })
  })
})
