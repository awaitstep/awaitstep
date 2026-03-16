import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudflareResourcesAPI } from '../resources'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(result: unknown, success = true) {
  return {
    ok: true,
    json: () => Promise.resolve({ result, success }),
    text: () => Promise.resolve(typeof result === 'string' ? result : JSON.stringify(result)),
  }
}

describe('CloudflareResourcesAPI', () => {
  let api: CloudflareResourcesAPI

  beforeEach(() => {
    vi.clearAllMocks()
    api = new CloudflareResourcesAPI({ accountId: 'acc123', apiToken: 'token123' })
  })

  describe('KV', () => {
    it('lists KV namespaces', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([{ id: 'ns1', title: 'Cache' }]))
      const result = await api.listKVNamespaces()
      expect(result).toEqual([{ id: 'ns1', title: 'Cache' }])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/kv/namespaces'),
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('creates KV namespace', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'ns2', title: 'Sessions' }))
      const result = await api.createKVNamespace('Sessions')
      expect(result.title).toBe('Sessions')
    })

    it('lists KV keys with prefix', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([{ name: 'user:1' }]))
      const result = await api.listKVKeys('ns1', { prefix: 'user:' })
      expect(result.keys).toEqual([{ name: 'user:1' }])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('prefix=user%3A'),
        expect.anything(),
      )
    })

    it('gets KV value', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('hello') })
      const result = await api.getKVValue('ns1', 'mykey')
      expect(result).toBe('hello')
    })
  })

  describe('D1', () => {
    it('lists D1 databases', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([{ uuid: 'db1', name: 'main' }]))
      const result = await api.listD1Databases()
      expect(result).toEqual([{ uuid: 'db1', name: 'main' }])
    })

    it('creates D1 database', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ uuid: 'db2', name: 'test' }))
      const result = await api.createD1Database('test')
      expect(result.name).toBe('test')
    })

    it('queries D1', async () => {
      const queryResult = [{ columns: ['id', 'name'], rows: [[1, 'Alice']], meta: { changes: 0, rows_read: 1, rows_written: 0 } }]
      mockFetch.mockResolvedValueOnce(mockResponse(queryResult))
      const result = await api.queryD1('db1', 'SELECT * FROM users')
      expect(result[0]!.columns).toEqual(['id', 'name'])
    })
  })

  describe('R2', () => {
    it('lists R2 buckets', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ buckets: [{ name: 'assets', creation_date: '2025-01-01' }] }))
      const result = await api.listR2Buckets()
      expect(result).toEqual([{ name: 'assets', creation_date: '2025-01-01' }])
    })

    it('lists R2 objects', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([{ key: 'file.txt', size: 100 }]))
      const result = await api.listR2Objects('assets')
      expect(result.objects).toEqual([{ key: 'file.txt', size: 100 }])
    })
  })
})
