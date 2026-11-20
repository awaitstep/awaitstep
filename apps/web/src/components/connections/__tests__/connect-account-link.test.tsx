import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testExtension } from '../../../extensions/__tests__/fixtures/test-extension'
import { useInstanceStore } from '../../../stores/instance-store'
import { connectAccountLink, useConnectAccountLink } from '../connect-account-link'

// The package a wrapping workspace would install, plugged in here.
vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('../../../extensions/__tests__/fixtures/test-extension')
  return { default: [testExtension] }
})

const plain = { id: 'plain', slots: {} }

const SLUGS = { org: 'acme', project: 'checkout' }

describe('connectAccountLink', () => {
  it('sends an org manager to Integrations when an extension draws it, even with Connections on', () => {
    expect(connectAccountLink(SLUGS, [plain, testExtension], true, true)).toEqual({
      kind: 'link',
      href: '/acme/integrations',
      label: 'Integrations',
    })
  })

  it('tells anyone else to ask an org manager: only they connect there', () => {
    // Cloud's accounts are org-wide; a project admin can't connect one.
    expect(connectAccountLink(SLUGS, [testExtension], false, false)).toEqual({
      kind: 'ask',
      label: 'Integrations',
    })
  })

  it('falls back to the org’s Connections page for an org manager while connections.ui is on', () => {
    expect(connectAccountLink(SLUGS, [plain], true, true)).toEqual({
      kind: 'link',
      href: '/acme/connections',
      label: 'Connections',
    })
  })

  it('sends a project admin to the project’s Connections, where they can connect one', () => {
    expect(connectAccountLink(SLUGS, [plain], true, false)).toEqual({
      kind: 'link',
      href: '/acme/checkout/connections',
      label: 'project’s Connections',
    })
  })

  it('links nowhere with neither', () => {
    expect(connectAccountLink(SLUGS, [plain], false, true)).toBeNull()
    expect(connectAccountLink(SLUGS, [plain], false, false)).toBeNull()
  })
})

describe('useConnectAccountLink', () => {
  beforeEach(() => {
    useInstanceStore.setState({ features: [], disabled: [] })
  })

  it('ignores an installed extension the instance doesn’t list', () => {
    const { result } = renderHook(() => useConnectAccountLink(SLUGS, true))
    expect(result.current).toEqual({
      kind: 'link',
      href: '/acme/connections',
      label: 'Connections',
    })
  })

  it('uses Integrations with connections.ui switched off', () => {
    useInstanceStore.setState({ features: ['test-ext'], disabled: ['connections.ui'] })
    const { result } = renderHook(() => useConnectAccountLink(SLUGS, true))
    expect(result.current).toEqual({
      kind: 'link',
      href: '/acme/integrations',
      label: 'Integrations',
    })
  })

  it('is null with connections.ui off and no extension', () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    const { result } = renderHook(() => useConnectAccountLink(SLUGS, true))
    expect(result.current).toBeNull()
  })
})
