import { describe, expect, it } from 'vitest'
import { deployedWorkerUrl, routeUrl } from '../deploy/worker-url.js'
import { CloudflareWorkflowsAdapter } from '../adapter.js'

describe('routeUrl', () => {
  it.each([
    ['wf.99listed.com/v1/2026/amce/*', 'https://wf.99listed.com/v1/2026/amce/'],
    ['api.acme.com/*', 'https://api.acme.com/'],
    ['api.acme.com/hook', 'https://api.acme.com/hook'],
    ['api.acme.com', 'https://api.acme.com/'],
    ['API.Acme.com/v1*', 'https://api.acme.com/v1'],
  ])('%s → %s', (pattern, url) => {
    expect(routeUrl(pattern)).toBe(url)
  })

  it.each([
    '*.acme.com/*',
    '*acme.com/*',
    'api.acme.com/*/x',
    'api.acme.com/a*b',
    'localhost/*',
    'api.acme.com/?x=1',
    '',
  ])('has no single URL for %s', (pattern) => {
    expect(routeUrl(pattern)).toBeNull()
  })
})

describe('deployedWorkerUrl', () => {
  const workersDev = 'Deployed\n  https://wf-abc.acme.workers.dev\n'

  it('takes a custom domain first, then a route, then workers.dev', () => {
    expect(
      deployedWorkerUrl({
        stdout: workersDev,
        routes: [{ pattern: 'wf.acme.com/v1/*' }],
        customDomains: ['api.acme.com'],
      }),
    ).toBe('https://api.acme.com/')
    expect(
      deployedWorkerUrl({ stdout: workersDev, routes: [{ pattern: 'wf.acme.com/v1/*' }] }),
    ).toBe('https://wf.acme.com/v1/')
    expect(deployedWorkerUrl({ stdout: workersDev })).toBe('https://wf-abc.acme.workers.dev')
  })

  it('skips a route with no single URL for the next one', () => {
    expect(
      deployedWorkerUrl({
        stdout: '',
        routes: [{ pattern: '*.acme.com/*' }, { pattern: 'wf.acme.com/*' }],
      }),
    ).toBe('https://wf.acme.com/')
  })

  it('records nothing when no address is usable: runs then go through the API', () => {
    expect(deployedWorkerUrl({ stdout: 'Deployed', routes: [{ pattern: '*.acme.com/*' }] })).toBe(
      undefined,
    )
  })
})

describe('runUrl: a recorded URL judged against the deploy’s own settings', () => {
  const adapter = new CloudflareWorkflowsAdapter()
  const route = (pattern: string) => ({ routes: [{ pattern, zoneName: 'acme.com' }] })

  it('takes a URL the settings give, and puts back an older deploy’s missing slash', () => {
    expect(adapter.runUrl('https://wf.acme.com/v1/', route('wf.acme.com/v1/*'))).toBe(
      'https://wf.acme.com/v1/',
    )
    expect(adapter.runUrl('https://wf.acme.com/v1', route('wf.acme.com/v1/*'))).toBe(
      'https://wf.acme.com/v1/',
    )
  })

  it('takes a workers.dev address as recorded', () => {
    expect(adapter.runUrl('https://wf-abc.acme.workers.dev', {})).toBe(
      'https://wf-abc.acme.workers.dev',
    )
  })

  it.each([
    [
      'a wildcard route an older deploy recorded whole',
      'https://*.acme.com',
      route('*.acme.com/*'),
    ],
    ['a mid-path wildcard', 'https://wf.acme.com/v1/*/x', route('wf.acme.com/v1/*/x')],
    ['a URL its settings don’t give', 'https://wf.acme.com/old/', route('wf.acme.com/v1/*')],
    ['no settings to judge it by', 'https://wf.acme.com/v1/', undefined],
    ['no URL', null, route('wf.acme.com/v1/*')],
  ])('is null for %s', (_, recorded, settings) => {
    expect(adapter.runUrl(recorded, settings)).toBeNull()
  })
})
