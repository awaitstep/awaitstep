import { describe, expect, it, vi } from 'vitest'
import { EXTENSIONS_MODULE, EXTENSIONS_PACKAGE, extensionsPlugin } from '../vite-plugin'

type Resolved = { id: string; external?: boolean } | null

async function resolveWith(found: Resolved, id = EXTENSIONS_MODULE) {
  const plugin = extensionsPlugin({ stub: '/repo/apps/web/src/extensions/stub.ts' })
  const resolve = vi.fn(async () => found)
  const error = vi.fn((message: string) => {
    throw new Error(message)
  })
  const hook = plugin.resolveId as unknown as (
    this: { resolve: typeof resolve; error: typeof error },
    id: string,
    importer?: string,
  ) => Promise<string | null>
  const result = await hook.call(
    { resolve, error },
    id,
    '/repo/apps/web/src/extensions/registry.ts',
  )
  return { result, resolve }
}

describe('extensionsPlugin', () => {
  it('resolves the virtual module to the extensions package when it is installed', async () => {
    const { result, resolve } = await resolveWith({ id: '/private/packages/web-ext/src/index.ts' })
    expect(result).toBe('/private/packages/web-ext/src/index.ts')
    expect(resolve).toHaveBeenCalledWith(
      EXTENSIONS_PACKAGE,
      '/repo/apps/web/src/extensions/registry.ts',
      { skipSelf: true },
    )
  })

  it('falls back to the empty stub when the package is not installed', async () => {
    const { result } = await resolveWith(null)
    expect(result).toBe('/repo/apps/web/src/extensions/stub.ts')
  })

  it('refuses a package that resolves as external rather than hide it behind the stub', async () => {
    await expect(resolveWith({ id: EXTENSIONS_PACKAGE, external: true })).rejects.toThrow(
      'resolved as external',
    )
  })

  it('keeps the package in the server bundle and out of the browser pre-bundle', () => {
    const plugin = extensionsPlugin({ stub: '/stub.ts' })
    const config = (plugin.config as () => unknown)()
    expect(config).toEqual({
      ssr: { noExternal: [EXTENSIONS_PACKAGE] },
      optimizeDeps: { exclude: [EXTENSIONS_PACKAGE] },
    })
  })

  it('refuses a copy installed from a registry, wherever node_modules is', async () => {
    for (const id of [
      '/home/me/node_modules/@awaitstep/web-extensions/index.js',
      '/repo/node_modules/.pnpm/@awaitstep+web-extensions@1.0.0/node_modules/@awaitstep/web-extensions/src/index.ts',
      'C:\\Users\\me\\node_modules\\@awaitstep\\web-extensions\\index.js',
    ]) {
      await expect(resolveWith({ id })).rejects.toThrow('installed copy')
    }
  })

  it('leaves every other import alone', async () => {
    const { result, resolve } = await resolveWith({ id: '/x.ts' }, 'react')
    expect(result).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })
})
