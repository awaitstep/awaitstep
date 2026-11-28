import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { CUSTOM_ITEM, PICKED_ITEM, expiryMenu } from '../key-expiry'

const values = (expiry: Parameters<typeof expiryMenu>[0]) =>
  expiryMenu(expiry).options.map((option) => option.value)

describe('expiryMenu', () => {
  it('offers the presets, Custom… and Never, with the preset selected', () => {
    expect(values('30d')).toEqual(['1h', '12h', '1d', '7d', '30d', CUSTOM_ITEM, 'never'])
    expect(expiryMenu('12h').value).toBe('12h')
    expect(expiryMenu('never').value).toBe('never')
  })

  it('shows a picked date as the selected item, ahead of Custom… to pick again', () => {
    const at = new Date(2027, 0, 15, 9, 30)
    const menu = expiryMenu({ at })
    expect(menu.value).toBe(PICKED_ITEM)
    expect(values({ at })).toEqual([
      '1h',
      '12h',
      '1d',
      '7d',
      '30d',
      PICKED_ITEM,
      CUSTOM_ITEM,
      'never',
    ])
    expect(menu.options.find((option) => option.value === PICKED_ITEM)?.label).toBe(
      format(at, 'MMM d, yyyy, p'),
    )
  })
})
