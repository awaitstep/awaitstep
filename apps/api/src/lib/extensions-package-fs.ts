import { access, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  checkDisabledFeatures,
  isInstalledCopy,
  isLinkedPackageEntry,
  type OssFeature,
} from '@awaitstep/ir'
import type { AppExtension, ExtensionsPackage } from '../types.js'
import { checkOAuthReturnPath } from './oauth-return-path.js'

/**
 * The package that plugs extensions in: its `./api` entry lists the API's
 * (and the open-source features it switches off), its `./web` entry the
 * dashboard's. It is not part of this repository: a
 * workspace that wraps this one links it, and plain module resolution from
 * the API finds it there.
 */
export const EXTENSIONS_PACKAGE = '@awaitstep/extensions'

export interface ExtensionsPackageLoader {
  /**
   * The package's folder in the nearest `node_modules` that holds it, from
   * the API's folder up to `/` (where Node's resolution looks), or null.
   */
  findPackage: (packageName: string) => Promise<string | null>
  /** Resolves a specifier to a file URL from the API's own location. */
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

/** What the API takes from the package: nothing when it is not installed. */
export interface LoadedExtensions {
  extensions: AppExtension[]
  disabled: readonly OssFeature[]
  /** Checked by `checkOAuthReturnPath`; absent keeps the Connections page. */
  oauthReturnPath?: string
}

const NONE: LoadedExtensions = { extensions: [], disabled: [] }

/**
 * The API extensions and switched-off features the wrapping workspace's
 * package exports (its `./api` entry's default, an `ExtensionsPackage`), or
 * none when it is not installed. An unknown switch name, or an OAuth return
 * path that could leave the web app, throws. Presence of the package decides; there is
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
  packageName = EXTENSIONS_PACKAGE,
  loader: ExtensionsPackageLoader = nodeLoader,
): Promise<LoadedExtensions> {
  const found = await loader.findPackage(packageName)
  if (!found) return NONE
  const packageDir = await loader.realpath(found)
  // Judged before anything is resolved: an installed copy is never looked into.
  if (isInstalledCopy(packageDir)) throw notLinked(packageName, packageDir)
  const path = await loader.realpath(fileURLToPath(loader.resolve(`${packageName}/api`)))
  if (!isLinkedPackageEntry(packageDir, path)) throw notLinked(packageName, packageDir, path)
  return packageExports(packageName, (await loader.load(pathToFileURL(path).href)).default)
}

function packageExports(packageName: string, exported: unknown): LoadedExtensions {
  const shape = exported as Partial<Record<keyof ExtensionsPackage, unknown>> | null
  if (
    typeof shape !== 'object' ||
    shape === null ||
    !Array.isArray(shape.extensions) ||
    (shape.disabled !== undefined && !Array.isArray(shape.disabled)) ||
    (shape.oauthReturnPath !== undefined && typeof shape.oauthReturnPath !== 'string')
  ) {
    throw new Error(
      `${packageName}/api must export { extensions: [...], disabled?: [...], oauthReturnPath?: '/…' } as its default.`,
    )
  }
  return {
    extensions: shape.extensions as AppExtension[],
    disabled: checkDisabledFeatures(shape.disabled ?? []),
    ...(shape.oauthReturnPath !== undefined && {
      oauthReturnPath: checkOAuthReturnPath(shape.oauthReturnPath),
    }),
  }
}

function notLinked(packageName: string, packageDir: string, entry?: string): Error {
  const where = entry ? `${packageDir} (entry ${entry})` : packageDir
  return new Error(
    `${packageName} at ${where} is not linked from source. Only a workspace link (workspace:*) is used.`,
  )
}
