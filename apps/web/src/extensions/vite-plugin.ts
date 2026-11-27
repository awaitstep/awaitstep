import type { Logger, Plugin } from 'vite'
import { isLinkedPackageEntry } from '@awaitstep/ir'
import { findPackageDir as findPackageDirOnDisk } from './package-dir-fs'

export const EXTENSIONS_MODULE = 'virtual:awaitstep/extensions'

/**
 * The package that plugs extensions in: its `./web` entry lists the
 * dashboard's, its `./api` entry the API's. It is not part of this
 * repository: a workspace that wraps this one links it, and plain module
 * resolution from the web app finds it there.
 */
export const EXTENSIONS_PACKAGE = '@awaitstep/extensions'

/** A stylesheet that brings Tailwind in: the one its rules are generated into. */
const TAILWIND_ENTRY = /@import\s+['"]tailwindcss['"]/

export interface ExtensionsPluginOptions {
  /** Absolute path of the empty stub used when the package is not installed. */
  stub: string
  /** Overrides the package looked for (tests). */
  packageName?: string
  /** Finds the package's folder (real path) as seen from a module, as `findPackageDir` does (tests). */
  findPackageDir?: (fromFile: string, packageName: string) => Promise<string | null>
}

/**
 * Resolves `virtual:awaitstep/extensions` to the extensions package's `./web`
 * entry when it is installed, else to the stub that lists none. Presence of
 * the package decides; there is no flag to set.
 *
 * The package ships source that imports the app's own modules
 * (`@awaitstep/web/ui/*`), so it is always compiled with the app: never left
 * external to the server bundle (the server would then load its source
 * as-is) nor pre-bundled for the browser (that would inline a second copy of
 * the modules it imports).
 *
 * Only a package linked from the wrapping workspace's own source is taken
 * (`workspace:*`, so its folder's real path is outside every `node_modules`),
 * and only an entry inside that folder. Module
 * resolution walks up to `/`, so a copy installed from a registry — in a
 * parent folder, the home folder, or hoisted in as someone's dependency —
 * would otherwise run in every page and in the server bundle; that is refused.
 *
 * The package's folder is outside the app's, so Tailwind would never read it:
 * a class only an extension uses would have no rule. The app's stylesheet is
 * therefore told to read the linked package's source too.
 */
export function extensionsPlugin({
  stub,
  packageName = EXTENSIONS_PACKAGE,
  findPackageDir = findPackageDirOnDisk,
}: ExtensionsPluginOptions): Plugin {
  let logger: Logger | undefined
  let announced = false
  return {
    name: 'awaitstep:extensions',
    enforce: 'pre',
    config() {
      // Both match by package name, so they cover the ./web entry too.
      return { ssr: { noExternal: [packageName] }, optimizeDeps: { exclude: [packageName] } }
    },
    configResolved(config) {
      logger = config.logger
    },
    async resolveId(id, importer) {
      if (id !== EXTENSIONS_MODULE) return null
      const installed = await this.resolve(`${packageName}/web`, importer, { skipSelf: true })
      if (!installed) return stub
      // Installed but left out of the bundle: the stub would hide it without a word.
      if (installed.external) {
        this.error(`${packageName} is installed but resolved as external; it must be bundled.`)
      }
      // The folder decides, not just the entry: an installed package's export
      // target or a symlink can land outside node_modules.
      const entry = installed.id.split('?')[0]!
      const packageDir = await findPackageDir(importer ?? stub, packageName)
      if (!packageDir || !isLinkedPackageEntry(packageDir, entry)) {
        this.error(
          `${packageName} resolved to ${entry} (package folder ${packageDir ?? 'not found'}), an installed copy. Only a workspace link (workspace:*) to its source is used.`,
        )
      }
      if (!announced) {
        announced = true
        logger?.info(`Extensions: ${installed.id}`)
      }
      return installed.id
    },
    async transform(code, id) {
      if (!TAILWIND_ENTRY.test(code) || !id.split('?')[0]!.endsWith('.css')) return null
      const packageDir = await findPackageDir(stub, packageName)
      // The rule the package is loaded by, so a folder that is not a linked
      // package (an installed copy, a filesystem root) is never handed to Tailwind to read.
      if (!packageDir || !isLinkedPackageEntry(packageDir, `${packageDir}/package.json`)) {
        return null
      }
      return { code: `${code}\n@source ${JSON.stringify(packageDir)};\n`, map: null }
    },
  }
}
