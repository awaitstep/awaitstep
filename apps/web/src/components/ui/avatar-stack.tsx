import { Avatar } from './avatar'

interface Person {
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
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Overlapping avatars for who is in a project or workspace. */
export function AvatarStack({ people, max = 3 }: AvatarStackProps) {
  const shown = Math.min(max, people.length)
  const rest = people.length - shown
  return (
    <span role="img" aria-label={describePeople(people, shown)} className="flex">
      {people.slice(0, shown).map((person, i) => (
        <span key={person.name} aria-hidden="true" className={i > 0 ? '-ml-2' : undefined}>
          <Avatar
            name={person.name}
            src={person.image}
            className="size-[26px] text-3xs ring-2 ring-card"
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          aria-hidden="true"
          className="-ml-2 flex size-[26px] items-center justify-center rounded-full bg-muted text-3xs text-muted-foreground ring-2 ring-card"
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
