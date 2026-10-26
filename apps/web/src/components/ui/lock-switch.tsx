import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Badge } from './badge'
import { buttonVariants } from './button'
import { DangerRow } from './danger-zone'
import { ShellLink } from './shell-link'
import { Switch } from './switch'

interface LockSwitchProps {
  locked: boolean
  onChange: (locked: boolean) => void
  /**
   * What the current state means and who can change it, e.g. "On. Project 101
   * and its workspaces can't be deleted until a project admin or org owner
   * turns this off."
   */
  description: ReactNode
  /** Who turned the lock on; added to the description while it is on. */
  setBy?: { name: string; date: string }
  /**
   * The lock comes from a parent scope: shows "From <name>" and a link to
   * manage it there instead of a switch.
   */
  inheritedFrom?: { name: string; href: string }
  /** Why this person can't change it, e.g. "Only project admins can change this". */
  disabledReason?: string
}

/** The deletion lock row of a `DangerZone`: a switch here, or a link to where it was set. */
export function LockSwitch({
  locked,
  onChange,
  description,
  setBy,
  inheritedFrom,
  disabledReason,
}: LockSwitchProps) {
  const fullDescription =
    locked && setBy && !inheritedFrom ? (
      <>
        {description} Set by {setBy.name}, {setBy.date}.
      </>
    ) : (
      description
    )

  const action = inheritedFrom ? (
    <ShellLink
      href={inheritedFrom.href}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      Manage in project
    </ShellLink>
  ) : (
    <Switch
      checked={locked}
      onCheckedChange={onChange}
      label="Deletion lock"
      tone="warn"
      disabledReason={disabledReason}
    />
  )

  return (
    <DangerRow
      icon={<Lock aria-hidden="true" />}
      tone="warn"
      title="Deletion lock"
      badge={inheritedFrom && <Badge variant="neutral">From {inheritedFrom.name}</Badge>}
      description={fullDescription}
      action={action}
    />
  )
}
