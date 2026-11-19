import { access, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isLinkedPackageEntry } from '@awaitstep/ir'
import type { AppExtension } from '../types.js'

/**
 * The package that plugs API extensions into the local dev server. It is not
 * part of this repository: a workspace that wraps this one links it, and
 * plain module resolution from the API finds it there.
 */
export const API_EXTENSIONS_PACKAGE = '@awaitstep/api-extensions'

export interface ExtensionsPackageLoader {
  /**
   * The package's folder in the nearest `node_modules` that holds it, from
   * the API's folder up to `/` (where Node's resolution looks), or null.
   */
  findPackage: (packageName: string) => Promise<string | null>
  /** Resolves the package to a file URL from the API's own location. */
  resolve: (specifier: string) => string
  /** The file's real path, symlinks followed. */
  realpath: (path: string) => Promise<string>
  load: (url: string) => Promise<{ default?: unknown }>
}

const HERE = dirname(fileURLToPath(import.meta.url))

// The folders Node's resolution would look in for a bare specifier.
async function findPackageFrom(start: string, packageName: string): Promise<string | null> {
  for (let dir = start; ; dir = dirname(dir)) {
    const packageDir = join(dir, 'node_modules', packageName)
    try {
      await access(join(packageDir, 'package.json'))
      return packageDir
    } catch {
      if (dirname(dir) === dir) return null
    }
  }
}

const nodeLoader: ExtensionsPackageLoader = {
  findPackage: (packageName) => findPackageFrom(HERE, packageName),
  resolve: (specifier) => import.meta.resolve(specifier),
  realpath,
  load: (url) => import(url),
}

/**
 * The extensions the wrapping workspace's package exports as its default, or
 * none when it is not installed. Presence of the package decides; there is
 * no flag to set. A package that is there but cannot be loaded throws: the
 * server must not quietly start without it.
 *
 * Only a package linked from the wrapping workspace's own source is taken
 * (`workspace:*`, so its folder's real path is outside every `node_modules`),
 * and only an entry inside that folder. Module
 * resolution walks up to `/`, so a copy installed from a registry — in a
 * parent folder, the home folder, or hoisted in as someone's dependency —
 * would otherwise run with the server's database and secrets; that is refused.
 */
export async function loadExtensionsPackage(
  packageName = API_EXTENSIONS_PACKAGE,
  loader: ExtensionsPackageLoader = nodeLoader,
): Promise<AppExtension[]> {
  const found = await loader.findPackage(packageName)
  if (!found) return []
  const [packageDir, path] = await Promise.all([
    loader.realpath(found),
    loader.realpath(fileURLToPath(loader.resolve(packageName))),
  ])
  if (!isLinkedPackageEntry(packageDir, path)) {
    throw new Error(
      `${packageName} at ${packageDir} (entry ${path}) is not linked from source. Only a workspace link (workspace:*) is used.`,
    )
  }
  const extensions = (await loader.load(pathToFileURL(path).href)).default
  if (!Array.isArray(extensions)) {
    throw new Error(`${packageName} must export an array of extensions as its default.`)
  }
  return extensions as AppExtension[]
}
