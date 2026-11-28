import { format } from 'date-fns'
import type { KeyExpiry, KeyExpiryPreset } from '../../../types/dashboard/api-keys'

/** The menu item that shows a picked date, and the one that opens the calendar. */
export const PICKED_ITEM = 'picked'
export const CUSTOM_ITEM = 'custom'

const PRESETS: { value: KeyExpiryPreset; label: string }[] = [
  { value: '1h', label: 'In 1 hour' },
  { value: '12h', label: 'In 12 hours' },
  { value: '1d', label: 'In 1 day' },
  { value: '7d', label: 'In 7 days' },
  { value: '30d', label: 'In 30 days' },
]

/**
 * The "Expires" menu for a key's current expiry: the presets, the picked date
 * as its own selected item once there is one, "Custom…" to pick (again), Never.
 */
export function expiryMenu(expiry: KeyExpiry): {
  value: string
  options: { value: string; label: string }[]
} {
  const picked = typeof expiry === 'object' ? expiry.at : null
  return {
    value: typeof expiry === 'object' ? PICKED_ITEM : expiry,
    options: [
      ...PRESETS,
      ...(picked ? [{ value: PICKED_ITEM, label: format(picked, 'MMM d, yyyy, p') }] : []),
      { value: CUSTOM_ITEM, label: 'Custom…' },
      { value: 'never', label: 'Never' },
    ],
  }
}
