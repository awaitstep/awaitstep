import { vi } from 'vitest'
import type { FetchLike } from '../../monaco/type-acquisition'

export interface FakePackage {
  version: string
  files: Record<string, string>
}

/** A jsDelivr stand-in: version resolution, flat file listing and file contents. */
export function fakeJsDelivr(packages: Record<string, FakePackage>) {
  const fetchFn = vi.fn(async (url: string) => {
    const resolve = url.match(/\/package\/resolve\/npm\/(.+)@([^@]+)$/)
    if (resolve) {
      const pkg = packages[decodeURIComponent(resolve[1]!)]
      return {
        ok: true,
        status: 200,
        json: async () => ({ version: pkg?.version ?? null }),
        text: async () => '',
      }
    }
    const flat = url.match(/\/package\/npm\/(.+)@([^@/]+)\/flat$/)
    if (flat) {
      const pkg = packages[flat[1]!]
      return {
        ok: !!pkg,
        status: pkg ? 200 : 404,
        json: async () => ({ files: Object.keys(pkg?.files ?? {}).map((name) => ({ name })) }),
        text: async () => '',
      }
    }
    const content = url.match(/cdn\.jsdelivr\.net\/npm\/(.+)@([^@/]+)(\/.+)$/)
    if (content) {
      const text = packages[content[1]!]?.files[content[3]!]
      return {
        ok: text !== undefined,
        status: text !== undefined ? 200 : 404,
        json: async () => ({}),
        text: async () => text ?? '',
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
  }) satisfies FetchLike
  return fetchFn
}
