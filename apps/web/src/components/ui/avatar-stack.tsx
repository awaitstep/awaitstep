import { useState } from 'react'
import { listNames } from '../../lib/name-list'
import { cn } from '../../lib/utils'
import { Avatar } from './avatar'
import { WORKSPACE_COLOURS, WORKSPACE_TILE_CLASS, type WorkspaceColour } from './workspace-colour'

interface Person {
  /** Keys the avatar; names repeat. */
  id: string
  name: string
  image?: string | null
}

interface AvatarStackProps {
  people: Person[]
  /** Avatars shown before the rest fold into "+N". */
  max?: number
}

function describePeople(people: Person[], shown: number): string {
  const names = people.slice(0, shown).map((person) => person.name)
  const rest = people.length - shown
  if (rest > 0) return `${names.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`
  return listNames(names)
}

/** A steady colour per person, from the workspace swatches, so the same face reads the same everywhere. */
export function avatarColour(id: string): WorkspaceColour {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return WORKSPACE_COLOURS[hash % WORKSPACE_COLOURS.length]!
}

// 30px with a 2px border in the card colour, overlapping by 8px: as the boards
// draw it, so two initials stay readable under the next avatar.
const CIRCLE = 'size-[30px] border-2 border-card text-3xs font-semibold'

/** Overlapping avatars for who is in a project or workspace. */
export function AvatarStack({ people, max = 3 }: AvatarStackProps) {
  const shown = Math.min(max, people.length)
  const rest = people.length - shown
  return (
    <span role="img" aria-label={describePeople(people, shown)} className="flex">
      {people.slice(0, shown).map((person, i) => (
        <span key={person.id} aria-hidden="true" className={i > 0 ? '-ml-2' : undefined}>
          <Avatar
            name={person.name}
            src={person.image}
            className={cn(CIRCLE, WORKSPACE_TILE_CLASS[avatarColour(person.id)])}
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            CIRCLE,
            '-ml-2 flex items-center justify-center rounded-full bg-muted font-normal text-muted-foreground',
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

/**
 * One person's avatar in their steady colour, beside their name in a list row.
 * Shows their photo, else the initials the person record carries, as every
 * other surface does.
 */
export function PersonAvatar({
  person,
  className,
}: {
  person: Person & { initials: string }
  /** Size and text overrides, e.g. the Profile page's 64px photo. */
  className?: string
}) {
  // The photo that failed to load, so a broken one falls back to the initials
  // and a new photo is tried again.
  const [failed, setFailed] = useState<string | null>(null)
  const image = person.image && person.image !== failed ? person.image : null

  function handleError() {
    setFailed(person.image ?? null)
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xs font-semibold',
        WORKSPACE_TILE_CLASS[avatarColour(person.id)],
        className,
      )}
    >
      {image ? (
        <img src={image} alt="" className="size-full object-cover" onError={handleError} />
      ) : (
        person.initials
      )}
    </span>
  )
}
