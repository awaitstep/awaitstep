import { useState, type ComponentProps } from 'react'
import type { KeyExpiry, KeyExpiryPreset } from '../../../types/dashboard/api-keys'
import { Button } from '../../ui/button'
import { DateTimePanel } from '../../ui/datetime-picker'
import { Popover, PopoverAnchor, PopoverContent } from '../../ui/popover'
import { Select } from '../../ui/select'
import { customExpiryError } from './key-format'
import { CUSTOM_ITEM, PICKED_ITEM, expiryMenu } from './key-expiry'

type TriggerAttributes = Pick<
  ComponentProps<typeof Select>,
  'id' | 'aria-describedby' | 'aria-invalid' | 'aria-required'
>

interface ExpiryFieldProps extends TriggerAttributes {
  value: KeyExpiry
  onChange: (value: KeyExpiry) => void
}

/** The key's "Expires" menu; "Custom…" opens a calendar under it instead of another field. */
export function ExpiryField({ value, onChange, ...trigger }: ExpiryFieldProps) {
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<Date | null>(null)
  const menu = expiryMenu(value)
  const draftError = draft ? customExpiryError(draft) : undefined

  function handleMenu(next: string) {
    if (next === CUSTOM_ITEM) {
      setDraft(typeof value === 'object' ? value.at : null)
      setPicking(true)
    } else if (next !== PICKED_ITEM) {
      onChange(next as KeyExpiryPreset)
    }
  }

  function handleUse() {
    if (!draft || draftError) return
    onChange({ at: draft })
    setPicking(false)
  }

  // The menu hands focus back to its trigger as it closes; that must not close the calendar.
  function keepOpenOnFocusOutside(event: Event) {
    event.preventDefault()
  }

  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div>
          <Select
            {...trigger}
            value={menu.value}
            onValueChange={handleMenu}
            options={menu.options}
            className="w-full"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-3"
        aria-label="Pick when the key expires"
        onFocusOutside={keepOpenOnFocusOutside}
      >
        <DateTimePanel value={draft} onChange={setDraft} minDate={new Date()} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-status-error">{draftError}</span>
          <Button type="button" size="sm" disabled={!draft || !!draftError} onClick={handleUse}>
            Set expiry
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
