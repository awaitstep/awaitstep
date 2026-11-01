import { describe, expect, it } from 'vitest'
import {
  clock,
  cleanErrorCode,
  looksLikeEmail,
  problemCopy,
  problemFromCode,
} from '../sign-in-problem'

describe('problemFromCode', () => {
  it('reads an expired or used email link as expired', () => {
    expect(problemFromCode('EXPIRED_TOKEN')).toEqual({ kind: 'expired' })
    expect(problemFromCode('invalid_token')).toEqual({ kind: 'expired' })
  })

  it('reads any other code, and the old ?error=true, as a sign-in that did not finish', () => {
    for (const code of ['access_denied', 'state_mismatch', 'true']) {
      expect(problemFromCode(code)).toEqual({ kind: 'provider' })
    }
  })

  it('reads the router’s boolean and number for ?error=true and ?error=7', () => {
    expect(problemFromCode(true)).toEqual({ kind: 'provider' })
    expect(problemFromCode(7)).toEqual({ kind: 'provider' })
  })

  it('has nothing to say without a code, or for a value that is not one', () => {
    expect(problemFromCode(false)).toBeNull()
    expect(problemFromCode({})).toBeNull()
    expect(problemFromCode(null)).toBeNull()
    expect(problemFromCode(undefined)).toBeNull()
    expect(problemFromCode('')).toBeNull()
  })
})

describe('cleanErrorCode', () => {
  it('keeps the characters a code has and drops the rest', () => {
    expect(cleanErrorCode('EXPIRED_TOKEN')).toBe('EXPIRED_TOKEN')
    expect(cleanErrorCode('<b>x</b> y')).toBe('bxby')
    expect(cleanErrorCode('x'.repeat(200))).toHaveLength(64)
    expect(cleanErrorCode('!!!')).toBeUndefined()
  })
})

describe('problemCopy', () => {
  it('names the lifetime Better Auth really uses', () => {
    expect(problemCopy({ kind: 'expired' }, true).body).toContain('5 minutes')
  })

  it('passes a refusal’s own reason through', () => {
    expect(problemCopy({ kind: 'failed', detail: 'Banned' }, true)).toEqual({
      title: 'Couldn’t sign you in',
      body: 'Banned',
    })
  })
})

describe('clock', () => {
  it('writes seconds as m:ss, never negative', () => {
    expect(clock(118)).toBe('1:58')
    expect(clock(60)).toBe('1:00')
    expect(clock(9.2)).toBe('0:10')
    expect(clock(-3)).toBe('0:00')
  })
})

describe('looksLikeEmail', () => {
  it('wants something@something.tld and nothing else', () => {
    expect(looksLikeEmail(' daniel@acme.test ')).toBe(true)
    for (const v of ['', 'daniel', 'daniel@acme', '@acme.test', 'a b@acme.test']) {
      expect(looksLikeEmail(v)).toBe(false)
    }
  })
})
