import { describe, it, expect, vi } from 'vitest'
import type { AppExtension } from '../types.js'
import {
  loadExtensionsPackage,
  type ExtensionsPackageLoader,
} from '../lib/extensions-package-fs.js'

const PACKAGE = '@awaitstep/test-extensions'
const LINKED_DIR = '/work/cloud/packages/api-extensions'
const LINKED = `${LINKED_DIR}/src/index.ts`
const INSTALLED_DIR = '/home/me/node_modules/@awaitstep/test-extensions'

/**
 * A loader whose package folder is `packageDir` (real path), resolving to the
 * entry `realPath`, which exports `exported` as its default.
 */
function loaderAt(
  realPath: string,
  exported: unknown,
  overrides: Partial<ExtensionsPackageLoader> & { packageDir?: string } = {},
): ExtensionsPackageLoader & { load: ReturnType<typeof vi.fn> } {
  return {
    findPackage: async () => '/work/cloud/node_modules/@awaitstep/test-extensions',
    resolve: () => `file://${realPath}`,
    realpath: async (path) =>
      path.startsWith('/work/cloud/node_modules/') ? (overrides.packageDir ?? LINKED_DIR) : path,
    load: vi.fn(async () => ({ default: exported })),
    ...overrides,
  } as ExtensionsPackageLoader & { load: ReturnType<typeof vi.fn> }
}

describe('loadExtensionsPackage', () => {
  it('plugs in nothing when the package is not installed anywhere up the tree', async () => {
    await expect(loadExtensionsPackage(PACKAGE)).resolves.toEqual([])
  })

  it('finds a package installed up the tree, and refuses it when it is a registry copy', async () => {
    // hono is a real dependency here, so it sits in node_modules.
    await expect(loadExtensionsPackage('hono')).rejects.toThrow(/not linked from source/)
  })

  it('does not resolve or load anything when the package is absent', async () => {
    const resolve = vi.fn()
    const loader = loaderAt(LINKED, [], { findPackage: async () => null, resolve })
    await expect(loadExtensionsPackage(PACKAGE, loader)).resolves.toEqual([])
    expect(resolve).not.toHaveBeenCalled()
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('loads the default export of a package linked from source', async () => {
    const extensions: AppExtension[] = [{ id: 'one' }, { id: 'two' }]
    const loader = loaderAt(LINKED, extensions)
    await expect(loadExtensionsPackage(PACKAGE, loader)).resolves.toBe(extensions)
    expect(loader.load).toHaveBeenCalledWith(`file://${LINKED}`)
  })

  it('refuses a copy installed under node_modules without running it', async () => {
    const loader = loaderAt(`${INSTALLED_DIR}/index.js`, [], { packageDir: INSTALLED_DIR })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('judges the real path, so a symlink into node_modules is refused too', async () => {
    const loader = loaderAt(LINKED, [], { packageDir: '/elsewhere/node_modules/pkg' })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('refuses an installed package whose main points outside its folder', async () => {
    // A legacy `main` such as ../../../x.js lands outside node_modules; the folder still decides.
    const loader = loaderAt('/home/me/x.js', [], { packageDir: INSTALLED_DIR })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('refuses a linked package whose entry is outside its folder or in its own node_modules', async () => {
    for (const entry of ['/work/other/index.ts', `${LINKED_DIR}/node_modules/evil/index.js`]) {
      const loader = loaderAt(entry, [])
      await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
      expect(loader.load).not.toHaveBeenCalled()
    }
  })

  it('refuses a folder under Node_Modules in another case', async () => {
    const loader = loaderAt('/home/me/Node_Modules/pkg/index.js', [], {
      packageDir: '/home/me/Node_Modules/pkg',
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
  })

  it('throws when an installed package cannot be resolved, rather than running without it', async () => {
    const broken = Object.assign(new Error(`Cannot find module '/work/cloud/src/index.ts'`), {
      code: 'ERR_MODULE_NOT_FOUND',
    })
    const loader = loaderAt(LINKED, [], {
      resolve: () => {
        throw broken
      },
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toBe(broken)
  })

  it('throws when an installed package fails to load', async () => {
    const loader = loaderAt(LINKED, [], {
      load: async () => {
        throw new Error('SyntaxError in extension')
      },
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/SyntaxError/)
  })

  it('refuses a default export that is not a list', async () => {
    await expect(loadExtensionsPackage(PACKAGE, loaderAt(LINKED, { id: 'one' }))).rejects.toThrow(
      /must export an array/,
    )
  })
})
