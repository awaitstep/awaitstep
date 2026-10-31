import { describe, expect, it } from 'vitest'
import {
  canDisconnect,
  deleteBlockedReason,
  describeUserAgent,
  type SignInMethod,
} from '../account.js'

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
}

describe('describeUserAgent', () => {
  it.each([
    [UA.chromeMac, 'Chrome on macOS', 'desktop'],
    [UA.safariIphone, 'Safari on iOS', 'phone'],
    [UA.firefoxLinux, 'Firefox on Linux', 'desktop'],
    [UA.edgeWindows, 'Edge on Windows', 'desktop'],
    [UA.chromeAndroid, 'Chrome on Android', 'phone'],
    ['curl/8.7.1', 'curl', 'terminal'],
    ['node', 'Node.js', 'terminal'],
  ])('reads %s as %s', (ua, device, kind) => {
    expect(describeUserAgent(ua)).toEqual({ device, kind })
  })

  it('says unknown for nothing or nonsense', () => {
    expect(describeUserAgent(null)).toEqual({ device: 'Unknown device', kind: 'desktop' })
    expect(describeUserAgent('   ')).toEqual({ device: 'Unknown device', kind: 'desktop' })
    expect(describeUserAgent('zzz')).toEqual({ device: 'Unknown device', kind: 'desktop' })
  })
})

describe('deleteBlockedReason', () => {
  it('is null when the person owns nothing alone', () => {
    expect(deleteBlockedReason([])).toBeNull()
  })

  it('names every organization they are the only owner of', () => {
    expect(deleteBlockedReason(['Acme Inc'])).toBe("You're the only owner of Acme Inc")
    expect(deleteBlockedReason(['Acme Inc', 'Bolt Labs', 'Cobalt'])).toBe(
      "You're the only owner of Acme Inc, Bolt Labs and Cobalt",
    )
  })
})

describe('canDisconnect', () => {
  const method = (provider: SignInMethod['provider'], connected: boolean): SignInMethod => ({
    provider,
    connected,
    connectedAt: connected ? '2026-10-01T00:00:00.000Z' : null,
    accountId: connected ? `a-${provider}` : null,
  })

  const ALL = { github: true, google: true, emailLink: true }
  const NO_LINKS = { ...ALL, emailLink: false }

  it('lets the last provider go while the email link still signs in', () => {
    const methods = [method('github', true), method('google', false), method('email', true)]
    expect(canDisconnect(methods, 'github', ALL)).toBe(true)
  })

  it('keeps the last provider when there is no email link', () => {
    const methods = [method('github', true), method('google', false)]
    expect(canDisconnect(methods, 'github', NO_LINKS)).toBe(false)
  })

  it('lets one of two providers go without an email link', () => {
    const methods = [method('github', true), method('google', true)]
    expect(canDisconnect(methods, 'google', NO_LINKS)).toBe(true)
  })

  it('never counts a provider the instance turned off as the way in that stays', () => {
    const methods = [method('github', true), method('google', true)]
    expect(canDisconnect(methods, 'google', { ...NO_LINKS, github: false })).toBe(false)
    // The turned-off one itself may go: Google still signs in.
    expect(canDisconnect(methods, 'github', { ...NO_LINKS, github: false })).toBe(true)
  })

  it('has nothing to disconnect for a provider not connected', () => {
    expect(canDisconnect([method('github', false)], 'github', ALL)).toBe(false)
  })
})
