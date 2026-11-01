import { RadioCardGroup, type RadioCardOption } from '../../ui/choice-card'
import { cn } from '../../../lib/utils'
import type { ReachPlace } from '../../../types/dashboard/variables'

/** What "Applies to" chooses between at a project (workspaces) or the org (projects). */
export interface PlaceChoices {
  noun: 'workspace' | 'project'
  options: ReachPlace[]
}

type Reaching = 'all' | 'some'

interface ReachPickerProps {
  choices: PlaceChoices
  all: boolean
  onAllChange: (all: boolean) => void
  picked: string[]
  onPickedChange: (picked: string[]) => void
  /** Already reached, so ticked and fixed: a place never loses a value it relies on. */
  locked: string[]
  /** Set their own value of the name: can't be reached. */
  blocked: string[]
}

/**
 * "Applies to" for a project's or org's variable: every workspace/project, or
 * exactly the ticked ones. Places that already have it stay ticked.
 */
export function ReachPicker({
  choices,
  all,
  onAllChange,
  picked,
  onPickedChange,
  locked,
  blocked,
}: ReachPickerProps) {
  const { noun, options } = choices
  const cards: RadioCardOption<Reaching>[] = [
    { value: 'all', title: `Every ${noun}`, description: `Including any added later.` },
    {
      value: 'some',
      title: `Specific ${noun}s`,
      description: `Only the ${noun}s you tick. You can add more later, not remove.`,
    },
  ]

  function handleChange(next: Reaching) {
    onAllChange(next === 'all')
  }

  function toggle(id: string, on: boolean) {
    onPickedChange(on ? [...picked, id] : picked.filter((p) => p !== id))
  }

  function renderList(reaching: Reaching) {
    if (reaching !== 'some') return null
    return (
      <ul
        aria-label={`${noun}s`}
        className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-lg border border-input p-1"
      >
        {options.map((place) => {
          const isLocked = locked.includes(place.id)
          const isBlocked = blocked.includes(place.id)
          const note = isLocked ? 'Already applies' : isBlocked ? 'Sets its own value' : null
          return (
            <li key={place.id}>
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                  isLocked || isBlocked
                    ? 'text-muted-foreground'
                    : 'cursor-pointer hover:bg-muted/70',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={isLocked || picked.includes(place.id)}
                  disabled={isLocked || isBlocked}
                  onChange={(e) => toggle(place.id, e.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">{place.name}</span>
                {note && <span className="text-2xs">{note}</span>}
              </label>
            </li>
          )
        })}
        {options.length === 0 && (
          <li className="px-2.5 py-1.5 text-sm text-muted-foreground">No {noun}s yet.</li>
        )}
      </ul>
    )
  }

  return (
    <RadioCardGroup
      legend="Applies to"
      value={all ? 'all' : 'some'}
      onChange={handleChange}
      options={cards}
      renderExtra={renderList}
    />
  )
}
