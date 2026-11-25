import { describe, it, expect, vi } from 'vitest'
import type { AppExtension } from '../types.js'
import {
  loadExtensionsPackage,
  type ExtensionsPackageLoader,
} from '../lib/extensions-package-fs.js'

const PACKAGE = '@awaitstep/test-extensions'
const LINKED_DIR = '/work/cloud/packages/extensions'
const LINKED = `${LINKED_DIR}/src/api.ts`
const INSTALLED_DIR = '/home/me/node_modules/@awaitstep/test-extensions'
const NONE = { extensions: [] }

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
    await expect(loadExtensionsPackage(PACKAGE)).resolves.toEqual({ extensions: [], disabled: [] })
  })

  it('finds a package installed up the tree, and refuses it when it is a registry copy', async () => {
    // hono is a real dependency here, so it sits in node_modules.
    await expect(loadExtensionsPackage('hono')).rejects.toThrow(/not linked from source/)
  })

  it('does not resolve or load anything when the package is absent', async () => {
    const resolve = vi.fn()
    const loader = loaderAt(LINKED, NONE, { findPackage: async () => null, resolve })
    await expect(loadExtensionsPackage(PACKAGE, loader)).resolves.toEqual({
      extensions: [],
      disabled: [],
    })
    expect(resolve).not.toHaveBeenCalled()
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('resolves the package’s ./api entry, not its root', async () => {
    const resolve = vi.fn(() => `file://${LINKED}`)
    await loadExtensionsPackage(PACKAGE, loaderAt(LINKED, NONE, { resolve }))
    expect(resolve).toHaveBeenCalledWith(`${PACKAGE}/api`)
  })

  it('loads the default export of a package linked from source', async () => {
    const extensions: AppExtension[] = [{ id: 'one' }, { id: 'two' }]
    const loader = loaderAt(LINKED, { extensions })
    await expect(loadExtensionsPackage(PACKAGE, loader)).resolves.toEqual({
      extensions,
      disabled: [],
    })
    expect(loader.load).toHaveBeenCalledWith(`file://${LINKED}`)
  })

  it('refuses a copy installed under node_modules without resolving or running it', async () => {
    const resolve = vi.fn(() => `file://${INSTALLED_DIR}/index.js`)
    const loader = loaderAt(`${INSTALLED_DIR}/index.js`, NONE, {
      packageDir: INSTALLED_DIR,
      resolve,
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(resolve).not.toHaveBeenCalled()
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('judges the real path, so a symlink into node_modules is refused too', async () => {
    const loader = loaderAt(LINKED, NONE, { packageDir: '/elsewhere/node_modules/pkg' })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('refuses an installed package whose entry lands outside its folder', async () => {
    // An export target or a symlink that escapes node_modules: the folder still decides.
    const loader = loaderAt('/home/me/x.js', NONE, { packageDir: INSTALLED_DIR })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('refuses a linked package whose entry is outside its folder or in its own node_modules', async () => {
    for (const entry of ['/work/other/index.ts', `${LINKED_DIR}/node_modules/evil/index.js`]) {
      const loader = loaderAt(entry, NONE)
      await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
      expect(loader.load).not.toHaveBeenCalled()
    }
  })

  it('refuses a folder under Node_Modules in another case', async () => {
    const loader = loaderAt('/home/me/Node_Modules/pkg/index.js', NONE, {
      packageDir: '/home/me/Node_Modules/pkg',
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/not linked from source/)
  })

  it('throws when an installed package cannot be resolved, rather than running without it', async () => {
    const broken = Object.assign(new Error(`Cannot find module '/work/cloud/src/index.ts'`), {
      code: 'ERR_MODULE_NOT_FOUND',
    })
    const loader = loaderAt(LINKED, NONE, {
      resolve: () => {
        throw broken
      },
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toBe(broken)
  })

  it('throws when an installed package fails to load', async () => {
    const loader = loaderAt(LINKED, NONE, {
      load: async () => {
        throw new Error('SyntaxError in extension')
      },
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/SyntaxError/)
  })

  it('refuses a default export without an extensions list, the old bare list included', async () => {
    for (const exported of [[], { id: 'one' }, null, { extensions: {} }]) {
      await expect(loadExtensionsPackage(PACKAGE, loaderAt(LINKED, exported))).rejects.toThrow(
        /must export \{ extensions: \[\.\.\.\], disabled\?: \[\.\.\.\], oauthReturnPath\?: '\/…', database\?: 'postgres' \}/,
      )
    }
  })

  it('returns the OAuth return path, and refuses one that is not a web app path', async () => {
    const named = loaderAt(LINKED, {
      extensions: [],
      oauthReturnPath: '/{org}/integrations',
    })
    await expect(loadExtensionsPackage(PACKAGE, named)).resolves.toEqual({
      extensions: [],
      disabled: [],
      oauthReturnPath: '/{org}/integrations',
    })
    const offsite = loaderAt(LINKED, { extensions: [], oauthReturnPath: '//evil.test/{org}' })
    await expect(loadExtensionsPackage(PACKAGE, offsite)).rejects.toThrow(/is not valid/)
    const notText = loaderAt(LINKED, { extensions: [], oauthReturnPath: 42 })
    await expect(loadExtensionsPackage(PACKAGE, notText)).rejects.toThrow(/must export/)
  })

  it('marks a package that runs on Postgres only, and refuses any other database', async () => {
    const pg = loaderAt(LINKED, { extensions: [], database: 'postgres' })
    await expect(loadExtensionsPackage(PACKAGE, pg)).resolves.toEqual({
      extensions: [],
      disabled: [],
      postgresOnly: true,
    })
    for (const database of ['sqlite', 'pg', true]) {
      const other = loaderAt(LINKED, { extensions: [], database })
      await expect(loadExtensionsPackage(PACKAGE, other)).rejects.toThrow(/must export/)
    }
  })

  it('refuses a disabled entry that is not a list', async () => {
    const loader = loaderAt(LINKED, { extensions: [], disabled: 'playground' })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(/must export/)
  })

  it('returns the switched-off features, each once, in list order', async () => {
    const loader = loaderAt(LINKED, {
      extensions: [],
      disabled: ['connections.apiTokens', 'playground', 'connections.ui'],
    })
    await expect(loadExtensionsPackage(PACKAGE, loader)).resolves.toEqual({
      extensions: [],
      disabled: ['playground', 'connections.ui', 'connections.apiTokens'],
    })
  })

  it('refuses an unknown switch name rather than starting with the feature on', async () => {
    const loader = loaderAt(LINKED, { extensions: [], disabled: ['playgrond'] })
    await expect(loadExtensionsPackage(PACKAGE, loader)).rejects.toThrow(
      /Unknown feature switch "playgrond"/,
    )
  })
})
