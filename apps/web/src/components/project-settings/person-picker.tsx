import { useState } from 'react'
import { useOrgPeople } from '../../data/dashboard/members'
import type { Person } from '../../types/dashboard/session'
import { ScopeSwitcher } from '../shell/scope-switcher'

interface PersonPickerProps {
  org: { slug: string; name: string }
  /** People who can't be picked: already picked, or already in every workspace. */
  exclude: Set<string>
  onPick: (person: Person) => void
}

/** "+ Add person": search the org's people and pick one. */
export function PersonPicker({ org, exclude, onPick }: PersonPickerProps) {
  const [open, setOpen] = useState(false)
  const people = useOrgPeople(org.slug, { enabled: open })
  const candidates = (people.data ?? []).filter((person) => !exclude.has(person.id))

  function handleSelect(id: string) {
    const person = candidates.find((p) => p.id === id)
    if (person) onPick(person)
  }

  function emptyText(query: string): string {
    if (people.isPending) return 'Loading people…'
    return query ? `Nothing matches “${query}”` : `Everyone in ${org.name} is already in`
  }

  return (
    <ScopeSwitcher
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="rounded-full border border-dashed border-input px-2.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          + Add person
        </button>
      }
      label="Add a person"
      searchPlaceholder="Find a person"
      groups={[
        {
          label: `${org.name} people`,
          items: candidates.map((person) => ({
            id: person.id,
            name: person.name,
            detail: person.email,
            tile: { initial: person.initials },
          })),
        },
      ]}
      currentLabel="Added"
      onSelect={handleSelect}
      emptyText={emptyText}
    />
  )
}
