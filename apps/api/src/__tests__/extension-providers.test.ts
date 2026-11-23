import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ProviderCapabilities, WorkflowProvider } from '@awaitstep/codegen'
import type { AppExtension } from '../types.js'
import { acceptsConnections, useExtensionProviders } from '../lib/provider-registry.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import { createTestApp, resetStore, TEST_ORG_ID } from './helpers.js'

const testCapabilities: ProviderCapabilities = {
  id: 'test-provider',
  label: 'Test provider',
  handlerKinds: ['fetch'],
  importSchemes: [],
  bindingKinds: [],
  bindingKindLabels: {},
}

function testProvider(): WorkflowProvider {
  return {
    name: 'test-provider',
    capabilities: testCapabilities,
    validateCredentials: () => null,
    inspectCredentials: async () => ({ ok: true, accounts: [] }),
  } as unknown as WorkflowProvider
}

function post(app: ReturnType<typeof createTestApp>, path: string, body: unknown) {
  return app.request(`${path}?organizationId=${TEST_ORG_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const connectBody = {
  provider: 'test-provider',
  credentials: { accountId: 'acct-1', apiToken: 'token-1' },
  name: 'Mine',
}

const withTestProvider: AppExtension = {
  id: 'acme-ext',
  providers: { 'test-provider': testProvider },
}

async function listedProviderIds(app: ReturnType<typeof createTestApp>): Promise<string[]> {
  const res = await app.request('/api/providers')
  expect(res.status).toBe(200)
  const body = (await res.json()) as { providers: { id: string }[] }
  return body.providers.map((p) => p.id)
}

describe('providers from extensions', () => {
  beforeEach(() => resetStore())
  // Registration is per app; leave none behind for other files' apps.
  afterEach(() => useExtensionProviders([]))

  it('lists an extension’s provider next to the built-in one', async () => {
    const app = createTestApp({ extensions: [withTestProvider] })
    expect(await listedProviderIds(app)).toEqual(['cloudflare', 'test-provider'])
  })

  it('resolves an extension’s provider by id, like a built-in one', () => {
    createTestApp({ extensions: [withTestProvider] })
    expect(resolveProvider('test-provider').name).toBe('test-provider')
  })

  it('drops an earlier app’s extension providers when a new app has none', async () => {
    createTestApp({ extensions: [withTestProvider] })
    const app = createTestApp()
    expect(await listedProviderIds(app)).toEqual(['cloudflare'])
    expect(() => resolveProvider('test-provider')).toThrow(/Unsupported provider: test-provider/)
  })

  it('refuses at startup an id a built-in provider already has, naming it', () => {
    const clash: AppExtension = { id: 'clash', providers: { cloudflare: testProvider } }
    expect(() => createTestApp({ extensions: [clash] })).toThrow(
      'Provider id "cloudflare" (extension "clash") is already a built-in provider.',
    )
  })

  it('refuses at startup an id two extensions register, naming both', () => {
    const again: AppExtension = { id: 'again', providers: { 'test-provider': testProvider } }
    expect(() => createTestApp({ extensions: [withTestProvider, again] })).toThrow(
      'Provider id "test-provider" is registered twice (extensions "acme-ext" and "again").',
    )
  })

  it('refuses at startup an id that is not a provider id', () => {
    for (const id of ['Bad', '1st', 'has space', '__proto__']) {
      const bad: AppExtension = { id: 'bad', providers: { [id]: testProvider } }
      expect(() => createTestApp({ extensions: [bad] }), id).toThrow(/is not valid/)
    }
  })

  it('refuses at startup a provider its factory cannot build without options', () => {
    const throws: AppExtension = {
      id: 'broken',
      providers: {
        'test-provider': () => {
          throw new Error('no deployer')
        },
      },
    }
    expect(() => createTestApp({ extensions: [throws] })).toThrow(
      'Provider "test-provider" (extension "broken") could not be built: no deployer',
    )
  })

  it('refuses at startup a provider named other than its id', () => {
    const misnamed: AppExtension = { id: 'acme-ext', providers: { 'other-id': testProvider } }
    expect(() => createTestApp({ extensions: [misnamed] })).toThrow(
      'Provider "other-id" (extension "acme-ext") is named "test-provider"; a provider\'s name must be its id.',
    )
  })

  it('keeps the earlier set when a new set is refused', () => {
    createTestApp({ extensions: [withTestProvider] })
    const clash: AppExtension = { id: 'clash', providers: { cloudflare: testProvider } }
    expect(() => createTestApp({ extensions: [clash] })).toThrow()
    expect(resolveProvider('test-provider').name).toBe('test-provider')
  })

  it('refuses a user account for an extension provider it does not list as connectable', async () => {
    const app = createTestApp({ extensions: [withTestProvider] })
    expect(acceptsConnections('test-provider')).toBe(false)
    const res = await post(app, '/api/connections', connectBody)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Unsupported provider: test-provider' })
    const verify = await post(app, '/api/connections/verify-token', {
      provider: 'test-provider',
      credentials: connectBody.credentials,
    })
    expect(verify.status).toBe(400)
  })

  it('takes user accounts for an extension provider listed as connectable', () => {
    createTestApp({
      extensions: [{ ...withTestProvider, connectableProviders: ['test-provider'] }],
    })
    expect(acceptsConnections('test-provider')).toBe(true)
    expect(acceptsConnections('cloudflare')).toBe(true)
  })

  it('refuses at startup a connectable id the extension does not register', () => {
    const other: AppExtension = { id: 'other', connectableProviders: ['test-provider'] }
    expect(() => createTestApp({ extensions: [withTestProvider, other] })).toThrow(
      'Extension "other" lists "test-provider" as connectable, but does not register that provider.',
    )
  })
})
