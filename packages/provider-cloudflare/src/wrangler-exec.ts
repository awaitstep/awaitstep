import { createRequire } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'

/**
 * Where the pinned wrangler actually lives, as an absolute path.
 *
 * **Never run `npx wrangler` from inside a user's workspace.** `npx`
 * searches `node_modules/.bin` from the working directory first, and the
 * dependencies a workflow declares are installed into exactly that
 * directory. `npm install --ignore-scripts` still links a package's
 * executables, so a dependency declaring `"bin": { "wrangler": "./x.js" }`
 * becomes the thing `npx wrangler` runs — on the API host, as the API
 * process. Resolving our own copy by path removes the choice entirely.
 *
 * Resolved through `wrangler/package.json`, which the package exports;
 * `wrangler/bin/wrangler.js` is not an exported subpath, so it cannot be
 * resolved directly.
 *
 * The wrangler this package is built against. Must match the `wrangler`
 * dependency in package.json — a test asserts it does. Used only when a
 * local copy cannot be resolved.
 */
export const PINNED_WRANGLER_VERSION = '4.151.1'

export interface WranglerCommand {
  command: string
  /** Prefix for wrangler's own arguments. */
  args: string[]
}

let cached: WranglerCommand | null = null

/**
 * How to run wrangler, as a command and its leading arguments.
 *
 * Normally this package's own copy, by absolute path through node. When it
 * cannot be resolved — the self-host image bundles the API with tsup and
 * ships almost no node_modules — it falls back to npx with an **exact
 * version**. That matters: `npx wrangler` prefers `node_modules/.bin` from
 * the working directory, which is where a workflow's dependencies are
 * installed, while `npx wrangler@x.y.z` resolves from the registry and
 * never consults it.
 */
export function wranglerCommand(): WranglerCommand {
  if (cached) return cached
  cached = resolveLocalWrangler() ?? {
    command: 'npx',
    args: ['--yes', `wrangler@${PINNED_WRANGLER_VERSION}`],
  }
  return cached
}

function resolveLocalWrangler(): WranglerCommand | null {
  try {
    const require = createRequire(import.meta.url)
    const manifestPath = require.resolve('wrangler/package.json')
    const manifest = require('wrangler/package.json') as { bin?: Record<string, string> }
    const relative = manifest.bin?.['wrangler']
    if (!relative) return null
    return {
      command: process.execPath,
      args: [resolvePath(dirname(manifestPath), relative)],
    }
  } catch {
    return null
  }
}

/**
 * Variables a wrangler child is allowed to see.
 *
 * Everything else is withheld, because the API process holds the database
 * URL, the token-encryption key and the auth secret — and wrangler runs
 * user-supplied dependencies.
 *
 * **No `CLOUDFLARE_*` / `CF_*` / `WRANGLER_*` is inherited.** A deploy needs
 * credentials and passes the connection's own, explicitly. Inheriting them
 * instead would hand the *platform's* token to every `wrangler dev` session
 * running a user's workspace — the same hijack {@link wranglerCommand}
 * closes, through the environment rather than the binary.
 *
 * `HOME` is withheld for the same reason: `~/.wrangler` holds an OAuth login
 * on a self-host, and wrangler would read it. Callers that need a writable
 * home pass one.
 */
const ALLOWED_ENV = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'NODE_EXTRA_CA_CERTS',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'SystemRoot',
  'APPDATA',
  'LOCALAPPDATA',
  'ComSpec',
] as const

export interface WranglerEnvOptions {
  /**
   * `HOME` for the child — wrangler needs a writable one for its cache.
   * Give it a directory that belongs to this run; omitted, the child gets
   * no `HOME` rather than the host's.
   */
  home?: string
}

/**
 * The environment a wrangler child runs with: a short allow-list, plus
 * whatever the caller adds deliberately.
 *
 * An allow-list rather than a deny-list because the risk is what nobody
 * thought to exclude — a new secret added to the API's environment should
 * not reach user code by default.
 */
export function wranglerEnv(
  extra?: Record<string, string>,
  options?: WranglerEnvOptions,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of ALLOWED_ENV) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  if (options?.home) env['HOME'] = options.home
  // Wrangler prints a banner and checks for updates otherwise; neither is
  // useful in a log a user reads.
  env['WRANGLER_SEND_METRICS'] = 'false'
  return { ...env, ...extra }
}
