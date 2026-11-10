import { describe, expect, it } from 'vitest'
import {
  cloudflareWranglerOverrides,
  extractCloudflareSource,
} from '../../codegen/provider-profile.js'

describe('extractCloudflareSource', () => {
  it('reads a profile and its binding usage', () => {
    const source = `
      import { defineCloudflare, kv, d1 as database } from '#awaitstep/cloudflare'

      export default defineCloudflare({
        bindings: {
          KV_USERS: { kind: 'kv' },
          DB_MAIN: { kind: 'd1' },
          BUCKET_ASSETS: { kind: 'r2', bucket: 'assets' },
        },
        wrangler: {
          compatibility_flags: ['nodejs_compat'],
        },
      })

      const cache = kv(env, 'KV_USERS')
      const db = database(env, 'DB_MAIN')
      await cache.get('a')
      await db.prepare('select 1').all()
    `

    const result = extractCloudflareSource(source)

    expect(result.diagnostics).toEqual([])
    expect(result.profile).toEqual({
      provider: 'cloudflare',
      bindings: [
        { name: 'KV_USERS', kind: 'kv' },
        { name: 'DB_MAIN', kind: 'd1' },
        { name: 'BUCKET_ASSETS', kind: 'r2', resourceName: 'assets' },
      ],
      wrangler: { compatibility_flags: ['nodejs_compat'] },
    })
    expect(result.usage).toEqual([
      { name: 'KV_USERS', kind: 'kv' },
      { name: 'DB_MAIN', kind: 'd1' },
    ])
  })

  it('accepts `as const` after the profile object', () => {
    const source = `
      import { defineCloudflare } from '#awaitstep/cloudflare'
      export default defineCloudflare({
        bindings: { KV_CACHE: { kind: 'kv' } },
      } as const)
    `
    expect(extractCloudflareSource(source).profile?.bindings).toEqual([
      { name: 'KV_CACHE', kind: 'kv' },
    ])
  })

  it('ignores commented and string copies of accessor calls', () => {
    const source = `
      import { kv } from '#awaitstep/cloudflare'
      // kv(env, 'COMMENTED')
      const text = "kv(env, 'QUOTED')"
      const real = kv(env, 'REAL')
      return { text, real }
    `
    const result = extractCloudflareSource(source)
    expect(result.usage).toEqual([{ name: 'REAL', kind: 'kv' }])
    expect(result.diagnostics).toEqual([])
  })

  it('reports a non-literal binding name', () => {
    const source = `
      import { kv } from '#awaitstep/cloudflare'
      const name = 'KV_USERS'
      const cache = kv(env, name)
    `
    const result = extractCloudflareSource(source)
    expect(result.usage).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('string literals')
  })

  it('recognises every Cloudflare primitive, including aliases', () => {
    const source = `
      import {
        ai,
        analyticsEngine,
        browser,
        hyperdrive,
        queue,
        service,
        vectorize,
        workflow,
      } from '#awaitstep/cloudflare'

      ai(env, 'AI')
      analyticsEngine(env, 'ANALYTICS_EVENTS')
      browser(env, 'BROWSER')
      hyperdrive(env, 'HYPERDRIVE_PG')
      queue(env, 'QUEUE_JOBS')
      service(env, 'SERVICE_API')
      vectorize(env, 'VECTORIZE_DOCS')
      workflow(env, 'CHILD_FLOW')
    `
    expect(extractCloudflareSource(source).usage).toEqual([
      { name: 'AI', kind: 'ai' },
      { name: 'ANALYTICS_EVENTS', kind: 'analytics_engine' },
      { name: 'BROWSER', kind: 'browser' },
      { name: 'HYPERDRIVE_PG', kind: 'hyperdrive' },
      { name: 'QUEUE_JOBS', kind: 'queue' },
      { name: 'SERVICE_API', kind: 'service' },
      { name: 'VECTORIZE_DOCS', kind: 'vectorize' },
      { name: 'CHILD_FLOW', kind: 'workflow' },
    ])
  })

  it('ignores a method with the same name as an imported primitive', () => {
    const source = `
      import { kv } from '#awaitstep/cloudflare'
      const cache = client.kv(env, 'NOT_A_BINDING')
    `
    expect(extractCloudflareSource(source).usage).toEqual([])
  })

  it('reports an accessor that does not start with env', () => {
    const source = `
      import { kv } from '#awaitstep/cloudflare'
      const cache = kv(other, 'KV_USERS')
    `
    const result = extractCloudflareSource(source)
    expect(result.usage).toEqual([])
    expect(result.diagnostics[0]!.message).toContain('needs env')
  })

  it('rejects IDs in a profile', () => {
    const source = `
      import { defineCloudflare } from '#awaitstep/cloudflare'
      export default defineCloudflare({
        bindings: { KV_USERS: { kind: 'kv', id: 'abc' } },
      })
    `
    const result = extractCloudflareSource(source)
    expect(result.profile).toBeNull()
    expect(result.diagnostics[0]!.message).toContain('cannot carry an id')
  })

  it('rejects spreads in a profile', () => {
    const source = `
      import { defineCloudflare } from '#awaitstep/cloudflare'
      export default defineCloudflare({
        ...base,
        bindings: { KV_USERS: { kind: 'kv' } },
      })
    `
    const result = extractCloudflareSource(source)
    expect(result.profile).toBeNull()
    expect(result.diagnostics[0]!.message).toContain('Spreads')
  })

  it('reports unknown profile fields and binding kinds', () => {
    const source = `
      import { defineCloudflare } from '#awaitstep/cloudflare'
      export default defineCloudflare({
        bindings: { THING: { kind: 'durable_object' } },
        deploy: true,
      })
    `
    const result = extractCloudflareSource(source)
    expect(result.profile).toBeNull()
    expect(result.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        'Unknown defineCloudflare() field "deploy"',
        'Binding "THING" has an unknown kind',
      ]),
    )
  })

  it('does not reject a large project file that does not use Cloudflare', () => {
    const result = extractCloudflareSource('x'.repeat(60_000))
    expect(result.usage).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('refuses an oversized Cloudflare source before parsing it', () => {
    const result = extractCloudflareSource(
      `import { kv } from '#awaitstep/cloudflare'\n${'x'.repeat(512_000)}`,
    )
    expect(result.usage).toEqual([])
    expect(result.diagnostics[0]!.message).toContain('too large')
  })

  it('reports a profile/usage kind mismatch and drops the usage', () => {
    const source = `
      import { defineCloudflare, d1 } from '#awaitstep/cloudflare'
      export default defineCloudflare({ bindings: { KV_USERS: { kind: 'kv' } } })
      d1(env, 'KV_USERS')
    `
    const result = extractCloudflareSource(source)
    expect(result.usage).toEqual([])
    expect(result.diagnostics.map((d) => d.message)).toContain(
      'Binding "KV_USERS" is declared as kv but used as d1',
    )
  })

  it('extracts static wrangler overrides from a profile file', () => {
    const ir = {
      metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
      nodes: [],
      edges: [],
      entryNodeId: 'n1',
      runtime: {
        files: [
          {
            path: 'providers/cloudflare.ts',
            source: [
              "import { defineCloudflare } from '#awaitstep/cloudflare'",
              'export default defineCloudflare({',
              "  wrangler: { compatibility_flags: ['nodejs_compat'], logpush: true },",
              '})',
            ].join('\n'),
          },
        ],
      },
    }
    expect(cloudflareWranglerOverrides(ir as never)).toEqual({
      compatibility_flags: ['nodejs_compat'],
      logpush: true,
    })
  })

  it('returns no profile when the helper is not imported', () => {
    const source = `
      const result = kv(env, 'KV_USERS')
    `
    const result = extractCloudflareSource(source)
    expect(result.profile).toBeNull()
    expect(result.usage).toEqual([])
  })
})
