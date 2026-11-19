import { describe, expect, it, vi } from 'vitest'
import { EXTENSIONS_MODULE, EXTENSIONS_PACKAGE, extensionsPlugin } from '../vite-plugin'

type Resolved = { id: string; external?: boolean } | null

const LINKED_DIR = '/private/packages/web-ext'

async function resolveWith(
  found: Resolved,
  id = EXTENSIONS_MODULE,
  packageDir: string | null = LINKED_DIR,
) {
  const findPackageDir = vi.fn(async () => packageDir)
  const plugin = extensionsPlugin({ stub: '/repo/apps/web/src/extensions/stub.ts', findPackageDir })
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
    const { result, resolve } = await resolveWith({ id: `${LINKED_DIR}/src/index.ts` })
    expect(result).toBe(`${LINKED_DIR}/src/index.ts`)
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
    for (const dir of [
      '/home/me/node_modules/@awaitstep/web-extensions',
      '/repo/node_modules/.pnpm/@awaitstep+web-extensions@1.0.0/node_modules/@awaitstep/web-extensions',
      'C:\\Users\\me\\node_modules\\@awaitstep\\web-extensions',
    ]) {
      await expect(
        resolveWith({ id: `${dir}/src/index.ts` }, EXTENSIONS_MODULE, dir),
      ).rejects.toThrow('installed copy')
    }
  })

  it('refuses an installed package whose entry points outside node_modules', async () => {
    // A legacy `main` such as ../../../x.js: the entry alone would pass.
    await expect(
      resolveWith({ id: '/home/me/x.js' }, EXTENSIONS_MODULE, '/home/me/node_modules/pkg'),
    ).rejects.toThrow('installed copy')
  })

  it('refuses an entry outside the linked folder, or when no folder holds the package', async () => {
    await expect(resolveWith({ id: '/elsewhere/index.ts' })).rejects.toThrow('installed copy')
    await expect(
      resolveWith({ id: `${LINKED_DIR}/src/index.ts` }, EXTENSIONS_MODULE, null),
    ).rejects.toThrow('not found')
  })

  it('judges the entry without its query string', async () => {
    const { result } = await resolveWith({ id: `${LINKED_DIR}/src/index.ts?v=1` })
    expect(result).toBe(`${LINKED_DIR}/src/index.ts?v=1`)
  })

  it('leaves every other import alone', async () => {
    const { result, resolve } = await resolveWith({ id: '/x.ts' }, 'react')
    expect(result).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })
})
