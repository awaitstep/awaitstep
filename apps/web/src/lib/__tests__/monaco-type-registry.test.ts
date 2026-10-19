import { describe, expect, it, vi } from 'vitest'
import type { LibHost } from '../monaco/project-libs'
import type { FetchLike } from '../monaco/type-acquisition'
import { TypeLibRegistry } from '../monaco/type-registry'
import { fakeJsDelivr } from './fixtures/jsdelivr'

function host() {
  const libs = new Map<string, string>()
  const api: LibHost = {
    addExtraLib(content, uri) {
      libs.set(uri, content)
      return { dispose: () => libs.delete(uri) }
    },
  }
  return { api, libs }
}

const zod3 = { version: '3.23.8', files: { '/package.json': '{}', '/index.d.ts': 'v3' } }
const zod4 = { version: '4.1.0', files: { '/package.json': '{}', '/index.d.ts': 'v4' } }

describe('TypeLibRegistry', () => {
  it('installs a package once into every host and reuses the session cache', async () => {
    const fetchFn = fakeJsDelivr({ zod: zod4 })
    const registry = new TypeLibRegistry(fetchFn)
    const ts = host()
    const js = host()
    await registry.ensure([{ name: 'zod', range: '^4.0.0' }], [ts.api, js.api])
    expect(ts.libs.get('awaitstep://workflow/node_modules/zod/index.d.ts')).toBe('v4')
    expect(js.libs.size).toBe(2)
    const calls = fetchFn.mock.calls.length
    await registry.ensure([{ name: 'zod', range: '^4.0.0' }], [ts.api, js.api])
    expect(fetchFn.mock.calls.length).toBe(calls)
    expect(registry.state('zod')).toEqual({ key: 'zod@^4.0.0', retry: false })
  })

  it('replaces a package’s declarations when its range changes, never mixing versions', async () => {
    const packages: Record<string, typeof zod3> = { zod: zod3 }
    const fetchFn = fakeJsDelivr(packages)
    const registry = new TypeLibRegistry(fetchFn)
    const ts = host()
    await registry.ensure([{ name: 'zod', range: '^3.0.0' }], [ts.api])
    expect(ts.libs.get('awaitstep://workflow/node_modules/zod/index.d.ts')).toBe('v3')

    packages.zod = zod4
    await registry.ensure([{ name: 'zod', range: '^4.0.0' }], [ts.api])
    expect(ts.libs.get('awaitstep://workflow/node_modules/zod/index.d.ts')).toBe('v4')
    expect([...ts.libs.keys()]).toHaveLength(2)
  })

  it('stubs a failed fetch and retries it on the next ensure, dropping the stub once typed', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => {
      throw new Error('offline')
    })
    const registry = new TypeLibRegistry(fetchFn)
    const ts = host()
    await registry.ensure([{ name: 'zod', range: 'latest' }], [ts.api])
    const stub = 'awaitstep://workflow/node_modules/zod/__awaitstep_stub__.d.ts'
    expect(ts.libs.get(stub)).toContain("declare module 'zod'")
    expect(registry.state('zod')).toEqual({ key: 'zod@latest', retry: true })

    fetchFn.mockImplementation(fakeJsDelivr({ zod: zod4 }))
    await registry.ensure([{ name: 'zod', range: 'latest' }], [ts.api])
    expect(ts.libs.has(stub)).toBe(false)
    expect(ts.libs.get('awaitstep://workflow/node_modules/zod/index.d.ts')).toBe('v4')
    expect(registry.state('zod')?.retry).toBe(false)
  })

  it('does not retry a package that resolved but ships no types', async () => {
    const fetchFn = fakeJsDelivr({
      untyped: { version: '1.0.0', files: { '/package.json': '{}', '/index.js': 'js' } },
    })
    const registry = new TypeLibRegistry(fetchFn)
    const ts = host()
    await registry.ensure([{ name: 'untyped', range: 'latest' }], [ts.api])
    const calls = fetchFn.mock.calls.length
    await registry.ensure([{ name: 'untyped', range: 'latest' }], [ts.api])
    expect(fetchFn.mock.calls.length).toBe(calls)
    expect(registry.state('untyped')?.retry).toBe(false)
  })

  it('shares one in-flight install between overlapping ensures', async () => {
    const fetchFn = fakeJsDelivr({ zod: zod4 })
    const registry = new TypeLibRegistry(fetchFn)
    const ts = host()
    await Promise.all([
      registry.ensure([{ name: 'zod', range: 'latest' }], [ts.api]),
      registry.ensure([{ name: 'zod', range: 'latest' }], [ts.api]),
    ])
    const resolves = fetchFn.mock.calls.filter(([url]) => url.includes('/resolve/'))
    expect(resolves).toHaveLength(1)
  })
})
