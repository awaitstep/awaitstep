import { describe, expect, it } from 'vitest'
import { oauthResultToast } from '../oauth-result'

describe('oauthResultToast', () => {
  it('names the connected account', () => {
    expect(oauthResultToast({ status: 'ok', account: 'Acme', connected: true })).toEqual({
      tone: 'success',
      text: 'Cloudflare connected: Acme',
    })
  })

  it('does not claim a connection when the environment saved none', () => {
    expect(oauthResultToast({ status: 'ok', account: 'Acme' })).toEqual({
      tone: 'info',
      text: 'OAuth finished without saving a connection',
    })
  })

  it('calls a denial a cancellation', () => {
    expect(oauthResultToast({ status: 'denied', reason: 'access_denied' })).toEqual({
      tone: 'info',
      text: 'Cloudflare connection cancelled',
    })
  })

  it('keeps a refused scope short, leaving the detail to the API log', () => {
    expect(oauthResultToast({ status: 'error', reason: 'invalid_scope' })).toEqual({
      tone: 'error',
      text: 'Cloudflare denied a permission. Check the OAuth app’s scopes.',
    })
  })

  it('shortens a save failure', () => {
    expect(oauthResultToast({ status: 'error', reason: 'save' })).toEqual({
      tone: 'error',
      text: 'Couldn’t save the connection. Try again.',
    })
  })

  it('has a general line for anything else', () => {
    expect(oauthResultToast({ status: 'error', reason: 'exchange' })).toEqual({
      tone: 'error',
      text: 'Couldn’t connect to Cloudflare. Try again.',
    })
  })
})
