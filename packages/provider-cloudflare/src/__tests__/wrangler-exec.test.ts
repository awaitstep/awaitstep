import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import {
  PINNED_WRANGLER_VERSION,
  wranglerCommand,
  wranglerEnv,
  wranglerHome,
} from '../wrangler-exec.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('wranglerCommand', () => {
  it('runs an absolute path that exists, not a name to be looked up', () => {
    // The whole point: `npx wrangler` searches the working directory's
    // node_modules/.bin first, and that directory holds dependencies the
    // user chose.
    const { command, args } = wranglerCommand()
    expect(command).toBe(process.execPath)
    expect(isAbsolute(args[0]!)).toBe(true)
    expect(existsSync(args[0]!)).toBe(true)
  })

  it('resolves inside the wrangler package', () => {
    expect(wranglerCommand().args[0]!).toMatch(/wrangler[/\\]bin[/\\]wrangler\.js$/)
  })

  it('never runs a bare `wrangler`, however it resolved', () => {
    // The fallback is `npx --yes wrangler@<version>`: an exact version makes
    // npx fetch from the registry instead of preferring node_modules/.bin.
    // A bare name in either form would reintroduce the hijack.
    const { args } = wranglerCommand()
    expect(args).not.toContain('wrangler')
  })

  it('pins the same version the package depends on', () => {
    // The fallback names a version explicitly, so it has to track the
    // dependency or a self-host would run something else entirely.
    const require = createRequire(import.meta.url)
    const manifest = JSON.parse(readFileSync(require.resolve('../../package.json'), 'utf-8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['wrangler']).toBe(PINNED_WRANGLER_VERSION)
  })

  it('pins the same version the sandbox image installs', () => {
    // A third hand-kept copy: a bump that missed it would have sandbox
    // deploys run a different wrangler than self-hosted ones, silently.
    const require = createRequire(import.meta.url)
    const dockerfile = readFileSync(
      require.resolve('../../../../apps/api/Dockerfile.sandbox'),
      'utf-8',
    )
    const installed = /npm install -g wrangler@(\S+)/.exec(dockerfile)?.[1]
    expect(installed).toBe(PINNED_WRANGLER_VERSION)
  })
})

describe('wranglerEnv', () => {
  it('withholds the API process secrets', () => {
    // wrangler runs user-supplied dependencies. Everything the API holds —
    // the database, the encryption key, the auth secret — stays here.
    vi.stubEnv('DATABASE_URL', 'postgres://user:pw@host/db')
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'key-material')
    vi.stubEnv('BETTER_AUTH_SECRET', 'auth-secret')

    const env = wranglerEnv()

    expect(env['DATABASE_URL']).toBeUndefined()
    expect(env['TOKEN_ENCRYPTION_KEY']).toBeUndefined()
    expect(env['BETTER_AUTH_SECRET']).toBeUndefined()
    expect(JSON.stringify(env)).not.toContain('key-material')
  })

  it('withholds anything nobody thought to exclude', () => {
    // An allow-list, not a deny-list: a secret added to the API's
    // environment later must not reach user code by default.
    vi.stubEnv('SOME_FUTURE_SECRET', 'should-not-travel')
    expect(wranglerEnv()['SOME_FUTURE_SECRET']).toBeUndefined()
  })

  it('keeps what a child process genuinely needs', () => {
    const env = wranglerEnv()
    expect(env['PATH']).toBe(process.env['PATH'])
  })

  it('never inherits the platform’s own Cloudflare credentials', () => {
    // A self-host operator may well have these exported for the API
    // process. `wrangler dev` sessions run a user's workspace with the
    // dependencies that user chose: handing them the platform's token is
    // the same hijack wranglerCommand closes, by another route. A deploy
    // passes the connection's credentials explicitly instead.
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'platform-token')
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'platform-account')
    vi.stubEnv('CF_API_TOKEN', 'platform-token-legacy-name')
    vi.stubEnv('WRANGLER_API_TOKEN', 'platform-token-other-name')

    const env = wranglerEnv()

    expect(env['CLOUDFLARE_API_TOKEN']).toBeUndefined()
    expect(env['CLOUDFLARE_ACCOUNT_ID']).toBeUndefined()
    expect(env['CF_API_TOKEN']).toBeUndefined()
    expect(env['WRANGLER_API_TOKEN']).toBeUndefined()
    expect(JSON.stringify(env)).not.toContain('platform-token')
  })

  it('replaces HOME rather than leaving it unset', () => {
    // ~/.wrangler holds an OAuth login on a self-host, and wrangler reads
    // it. Omitting HOME does not help: os.homedir() falls back to the
    // user's passwd entry, so it has to be pointed somewhere else.
    vi.stubEnv('HOME', '/home/platform')
    const home = wranglerEnv()['HOME']
    expect(home).toBeTruthy()
    expect(home).not.toBe('/home/platform')
    expect(home).toBe(wranglerHome())
    expect(wranglerEnv(undefined, { home: '/tmp/elsewhere' })['HOME']).toBe('/tmp/elsewhere')
  })

  it('keeps one home across calls, so the npx cache survives', () => {
    // A fresh directory per run emptied the npm cache every time, and the
    // npx fallback re-downloaded wrangler inside each deploy's timeout.
    expect(wranglerEnv()['HOME']).toBe(wranglerEnv()['HOME'])
    expect(existsSync(wranglerHome())).toBe(true)
  })

  it('passes npm configuration through, so a private mirror still works', () => {
    // The npx fallback has to fetch from wherever the host is pointed, and
    // the deploy's own `npm install` already runs with this configuration.
    vi.stubEnv('npm_config_registry', 'https://npm.internal/')
    vi.stubEnv('npm_config_cafile', '/etc/ssl/internal.pem')
    const env = wranglerEnv()
    expect(env['npm_config_registry']).toBe('https://npm.internal/')
    expect(env['npm_config_cafile']).toBe('/etc/ssl/internal.pem')
  })

  it('takes credentials handed to it deliberately', () => {
    const env = wranglerEnv({ CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'token' })
    expect(env['CLOUDFLARE_ACCOUNT_ID']).toBe('acct')
    expect(env['CLOUDFLARE_API_TOKEN']).toBe('token')
  })

  it('lets an explicit value win over the inherited one', () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'inherited')
    expect(wranglerEnv({ CLOUDFLARE_API_TOKEN: 'explicit' })['CLOUDFLARE_API_TOKEN']).toBe(
      'explicit',
    )
  })
})
