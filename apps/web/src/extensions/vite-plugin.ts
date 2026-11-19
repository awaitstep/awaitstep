import type { Logger, Plugin } from 'vite'

export const EXTENSIONS_MODULE = 'virtual:awaitstep/extensions'

/**
 * The package that plugs extensions into the dashboard. It is not part of this
 * repository: a workspace that wraps this one installs it, and plain module
 * resolution from the web app finds it there.
 */
export const EXTENSIONS_PACKAGE = '@awaitstep/web-extensions'

export interface ExtensionsPluginOptions {
  /** Absolute path of the empty stub used when the package is not installed. */
  stub: string
  /** Overrides the package looked for (tests). */
  packageName?: string
}

/**
 * Resolves `virtual:awaitstep/extensions` to the extensions package's default
 * export when it is installed, else to the stub that lists none. Presence of
 * the package decides; there is no flag to set.
 *
 * The package ships source that imports the app's own modules
 * (`@awaitstep/web/ui/*`), so it is always compiled with the app: never left
 * external to the server bundle (the server would then load its source
 * as-is) nor pre-bundled for the browser (that would inline a second copy of
 * the modules it imports).
 *
 * Only a package linked from the wrapping workspace's own source is taken
 * (`workspace:*`, so its real path is outside every `node_modules`). Module
 * resolution walks up to `/`, so a copy installed from a registry — in a
 * parent folder, the home folder, or hoisted in as someone's dependency —
 * would otherwise run in every page and in the server bundle; that is refused.
 */
export function extensionsPlugin({
  stub,
  packageName = EXTENSIONS_PACKAGE,
}: ExtensionsPluginOptions): Plugin {
  let logger: Logger | undefined
  let announced = false
  return {
    name: 'awaitstep:extensions',
    enforce: 'pre',
    config() {
      return { ssr: { noExternal: [packageName] }, optimizeDeps: { exclude: [packageName] } }
    },
    configResolved(config) {
      logger = config.logger
    },
    async resolveId(id, importer) {
      if (id !== EXTENSIONS_MODULE) return null
      const installed = await this.resolve(packageName, importer, { skipSelf: true })
      if (!installed) return stub
      // Installed but left out of the bundle: the stub would hide it without a word.
      if (installed.external) {
        this.error(`${packageName} is installed but resolved as external; it must be bundled.`)
      }
      if (isInstalledCopy(installed.id)) {
        this.error(
          `${packageName} resolved to ${installed.id}, an installed copy. Only a workspace link (workspace:*) to its source is used.`,
        )
      }
      if (!announced) {
        announced = true
        logger?.info(`Extensions: ${installed.id}`)
      }
      return installed.id
    },
  }
}

/** A module under any `node_modules` folder: fetched from a registry, not linked from source. */
export function isInstalledCopy(id: string): boolean {
  return id.split(/[\\/]/).includes('node_modules')
}
