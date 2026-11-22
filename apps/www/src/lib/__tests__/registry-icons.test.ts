import { describe, expect, it } from 'vitest'
import { iconProblems, REGISTRY_ICONS } from '../registry-icons'

describe('REGISTRY_ICONS', () => {
  it('has an icon for the registry nodes, by node id', () => {
    expect(REGISTRY_ICONS.size).toBeGreaterThan(10)
    expect(REGISTRY_ICONS.has('resend')).toBe(true)
  })

  it('serves each icon as a file, never inlined into the page', () => {
    for (const url of REGISTRY_ICONS.values()) expect(url.startsWith('data:')).toBe(false)
  })
})

describe('iconProblems', () => {
  it('refuses an icon that could run script when opened on the site', () => {
    expect(
      iconProblems({
        'registry/nodes/evil/icon.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        'registry/nodes/fine/icon.svg':
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>',
      }),
    ).toEqual([expect.stringMatching(/^evil: icon\.svg must not contain scripts/)])
  })
})
