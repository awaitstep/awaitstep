import { describe, expect, it } from 'vitest'
import { safeRedirectPath, signInPath } from '../auth-redirect'

describe('safeRedirectPath', () => {
  it('keeps paths inside the app', () => {
    expect(safeRedirectPath('/invite/inv_sam')).toBe('/invite/inv_sam')
    expect(safeRedirectPath('/acme/projects?as=daniel')).toBe('/acme/projects?as=daniel')
  })

  it('refuses anything that could leave the site', () => {
    for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', 'invite', '', 7]) {
      expect(safeRedirectPath(value)).toBeUndefined()
    }
  })
})

describe('signInPath', () => {
  it('comes back to an app path, and drops one that would leave', () => {
    expect(signInPath('/invite/inv_sam')).toBe('/sign-in?redirect=%2Finvite%2Finv_sam')
    expect(signInPath('//evil.test')).toBe('/sign-in')
    expect(signInPath()).toBe('/sign-in')
  })
})
