import { Select } from '../ui/select'

export interface PickedScope {
  id: string
  /** "Project 101 › IT". */
  name: string
  /** "Project · all 3 workspaces", "Project 101 · workspace only". */
  scope: string
  role: string
  roles: { value: string; label: string }[]
}

interface PickedScopesProps {
  /** Names the list, e.g. "Picked projects and workspaces". */
  label: string
  picks: PickedScope[]
  onRoleChange: (id: string, role: string) => void
}

/** The picks under a `ScopeMultiPicker`, each with the role it grants (Invite people). */
export function PickedScopes({ label, picks, onRoleChange }: PickedScopesProps) {
  if (picks.length === 0) return null
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border"
    >
      {picks.map((pick) => (
        <PickedRow key={pick.id} pick={pick} onRoleChange={onRoleChange} />
      ))}
    </ul>
  )
}

interface PickedRowProps {
  pick: PickedScope
  onRoleChange: (id: string, role: string) => void
}

function PickedRow({ pick, onRoleChange }: PickedRowProps) {
  function handleChange(role: string) {
    onRoleChange(pick.id, role)
  }

  return (
    <li className="flex items-center gap-3 bg-muted/40 px-3.5 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{pick.name}</span>
        <span className="text-2xs text-muted-foreground">{pick.scope}</span>
      </span>
      <Select
        value={pick.role}
        onValueChange={handleChange}
        options={pick.roles}
        aria-label={`Role in ${pick.name}`}
        className="h-8 w-40 text-xs"
      />
    </li>
  )
}
