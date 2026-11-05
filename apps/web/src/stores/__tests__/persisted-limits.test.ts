// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_TRIGGER_PAYLOAD_BYTES } from '../../lib/ide/session-log'
import { boundPersistedText, MAX_PERSISTED_TEXT_CHARS } from '../bounded-persist'
import { forgetRememberedInputs, rememberedInputsStorage } from '../remembered-inputs'
import { browserStorage } from '../ssr-safe-storage'
import { useQuickTestStore } from '../quick-test-store'
import { DEFAULT_PAYLOAD, useTestSessionStore } from '../test-session-store'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  useTestSessionStore.setState({ payloads: {}, payloadErrors: {}, views: {} })
  useQuickTestStore.setState({ remembered: {}, views: {} })
})

describe('browserStorage', () => {
  it('swallows a failing write (quota exceeded) instead of throwing into set()', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => browserStorage().setItem('k', 'v')).not.toThrow()
    expect(() => useTestSessionStore.getState().setPayload('wf', '{"a":1}')).not.toThrow()
    expect(useTestSessionStore.getState().payloads.wf).toBe('{"a":1}')
  })

  it('reads null when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(browserStorage().getItem('k')).toBeNull()
  })
})

describe('boundPersistedText', () => {
  it('drops entries over the per-entry limit and keeps the newest within the total', () => {
    const big = 'x'.repeat(MAX_TRIGGER_PAYLOAD_BYTES)
    const entries = { tooBig: 'y'.repeat(MAX_TRIGGER_PAYLOAD_BYTES + 1) } as Record<string, string>
    for (let i = 0; i < 10; i++) entries[`w${i}`] = big
    const kept = boundPersistedText(entries, (t) => t.length, MAX_TRIGGER_PAYLOAD_BYTES)
    expect(kept.tooBig).toBeUndefined()
    const total = Object.values(kept).reduce((n, t) => n + t.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_PERSISTED_TEXT_CHARS)
    // The newest survive.
    expect(kept.w9).toBeDefined()
    expect(kept.w0).toBeUndefined()
  })
})

describe('what the stores persist', () => {
  it('does not write a payload the server would refuse', () => {
    useTestSessionStore.getState().setPayload('wf', 'x'.repeat(MAX_TRIGGER_PAYLOAD_BYTES + 1))
    const stored = JSON.parse(localStorage.getItem('awaitstep-test-session') ?? '{}')
    expect(stored.state?.payloads?.wf).toBeUndefined()
    useTestSessionStore.getState().setPayload('wf', '{"ok":true}')
    expect(JSON.parse(localStorage.getItem('awaitstep-test-session')!).state.payloads.wf).toBe(
      '{"ok":true}',
    )
    expect(DEFAULT_PAYLOAD).toBe('{}')
  })

  it('does not write Quick test arguments over the limit', () => {
    useQuickTestStore.getState().setField('k', 'inputs', 'x'.repeat(MAX_TRIGGER_PAYLOAD_BYTES + 1))
    const stored = JSON.parse(localStorage.getItem('awaitstep-quick-test') ?? '{}')
    expect(stored.state?.remembered?.k).toBeUndefined()
  })
})

describe('forgetRememberedInputs', () => {
  it('removes both stores’ keys and stops later writes', () => {
    useTestSessionStore.getState().setPayload('wf', '{"token":"secret"}')
    useQuickTestStore.getState().setField('k', 'inputs', '{"token":"secret"}')
    expect(localStorage.getItem('awaitstep-test-session')).not.toBeNull()
    expect(localStorage.getItem('awaitstep-quick-test')).not.toBeNull()

    forgetRememberedInputs()
    expect(localStorage.getItem('awaitstep-test-session')).toBeNull()
    expect(localStorage.getItem('awaitstep-quick-test')).toBeNull()

    useTestSessionStore.getState().setPayload('wf', '{"token":"again"}')
    rememberedInputsStorage().setItem('awaitstep-quick-test', 'x')
    expect(localStorage.getItem('awaitstep-test-session')).toBeNull()
    expect(localStorage.getItem('awaitstep-quick-test')).toBeNull()
  })
})
