import { X } from 'lucide-react'
import { Badge } from '../../badge'
import { SALES_MEMBERS } from './access'

/** The people chips under "Choose people now" on NewWorkspace. */
export function PickedPeople() {
  return (
    <div role="group" aria-label="People who can get in" className="flex flex-wrap gap-1.5">
      {SALES_MEMBERS.map((person) => (
        <Badge key={person.id} variant="success" className="gap-1.5 py-1 pr-1">
          {person.name}
          <button
            type="button"
            aria-label={`Remove ${person.name}`}
            className="rounded-full p-0.5 hover:bg-status-success/20"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        className="rounded-full border border-dashed border-input px-2.5 py-0.5 text-2xs text-muted-foreground"
      >
        + Add person
      </button>
    </div>
  )
}
