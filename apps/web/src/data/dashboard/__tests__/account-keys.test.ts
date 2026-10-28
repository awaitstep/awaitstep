import { describe, expect, it } from 'vitest'
import { dashKeys } from '../keys'

const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) =>
  prefix.every((part, i) => key[i] === part)

describe('account query keys', () => {
  it('keeps the profile, sign-in methods and sessions apart, so one change refetches one', () => {
    expect(startsWith(dashKeys.signInMethods(), dashKeys.account())).toBe(false)
    expect(startsWith(dashKeys.sessions(), dashKeys.account())).toBe(false)
  })
})
