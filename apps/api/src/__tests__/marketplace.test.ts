import { describe, it, expect, beforeEach } from 'vitest'
import type { RemoteNodeRegistry } from '../lib/remote-node-registry.js'
import type { NodeBundle, NodeDefinition } from '@awaitstep/ir'
import {
  createTestApp,
  mockDb,
  recordedAuditEvents,
  resetStore,
  TEST_ORG_ID,
  TEST_USER_ID,
} from './helpers.js'

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
      // Only an installed node has a usage count.
      expect(body.nodes[0].usage).toBeNull()
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
      expect(body.data).toHaveLength(1)
      expect(body.data[0].nodeId).toBe('test_node')
    })

    it('returns empty array when nothing installed', async () => {
      const res = await app.request(url('/installed'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(0)
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
      expect(body.nodes[0].usage).toBe(0)
      expect(body.nodes[0].inRegistry).toBe(true)
    })

    it('still lists an installed node the registry no longer has, so it can be removed', async () => {
      await mockDb.installNode({
        id: 'inst-gone',
        organizationId: TEST_ORG_ID,
        nodeId: 'gone_node',
        version: '0.9.0',
        bundle: '{}',
        installedBy: TEST_USER_ID,
      })
      const body = await (await app.request(url(''))).json()
      expect(body.nodes.find((n: { id: string }) => n.id === 'gone_node')).toMatchObject({
        installed: true,
        installedVersion: '0.9.0',
        latest: '0.9.0',
        inRegistry: false,
      })
    })
  })

  describe('the audit log (B7)', () => {
    const post = (path: string, body: unknown) =>
      app.request(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

    it('records an install, an update and a removal with their versions', async () => {
      const newer: RemoteNodeRegistry = {
        async getIndex() {
          const index = await mockRegistry.getIndex()
          const node = index.nodes[0]!
          return {
            ...index,
            nodes: [
              {
                ...node,
                latest: '1.1.0',
                versions: [...node.versions, { ...node.versions[0]!, version: '1.1.0' }],
              },
            ],
          }
        },
        getNodeBundle: mockRegistry.getNodeBundle,
      }
      app = createTestApp({ remoteNodeRegistry: newer })
      expect((await post('/install', { nodeId: 'test_node', version: '1.0.0' })).status).toBe(201)
      expect((await post('/update', { nodeId: 'test_node' })).status).toBe(200)
      expect((await post('/uninstall', { nodeId: 'test_node' })).status).toBe(200)
      expect(recordedAuditEvents().map((e) => [e.event, e.action, e.target, e.detail])).toEqual([
        ['node.install', 'installed the node', 'Test Node', 'v1.0.0 · Dashboard'],
        ['node.update', 'updated the node', 'Test Node', 'v1.0.0 → v1.1.0 · Dashboard'],
        ['node.uninstall', 'removed the node', 'Test Node', 'v1.1.0 · Dashboard'],
      ])
    })

    it('records nothing when the install is refused', async () => {
      await post('/install', { nodeId: 'nonexistent' })
      expect(recordedAuditEvents()).toEqual([])
    })
  })
})
