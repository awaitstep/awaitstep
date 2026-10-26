import { useId } from 'react'
import { cn } from '../../lib/utils'
import { FieldGroup } from './form-field'
import { WORKSPACE_COLOURS, WORKSPACE_DOT_CLASS, type WorkspaceColour } from './workspace-colour'

const COLOUR_NAME: Record<WorkspaceColour, string> = {
  green: 'Green',
  blue: 'Blue',
  amber: 'Amber',
  purple: 'Purple',
  rose: 'Rose',
}

interface SwatchPickerProps {
  legend?: string
  value: WorkspaceColour
  onChange: (colour: WorkspaceColour) => void
}

/**
 * The five workspace colours as a radio group: arrow keys move between them
 * and each is read out by name.
 */
export function SwatchPicker({ legend = 'Colour', value, onChange }: SwatchPickerProps) {
  const name = useId()
  return (
    <FieldGroup legend={legend}>
      <span className="flex gap-2.5">
        {WORKSPACE_COLOURS.map((colour) => (
          <label
            key={colour}
            className={cn(
              'size-8 cursor-pointer rounded-lg border-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
              WORKSPACE_DOT_CLASS[colour],
              colour === value ? 'border-foreground' : 'border-transparent',
            )}
          >
            <input
              type="radio"
              name={name}
              value={colour}
              checked={colour === value}
              onChange={() => onChange(colour)}
              aria-label={COLOUR_NAME[colour]}
              className="sr-only"
            />
          </label>
        ))}
      </span>
    </FieldGroup>
  )
}
