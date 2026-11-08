import { useState, type ReactElement } from 'react'
import { Plus, Settings } from 'lucide-react'
import { useOrgs, useSwitchOrg } from '../../data/dashboard/session'
import { dashboardPath, orgPath, orgSettingsPath, withNewDialog } from '../../lib/dashboard-paths'
import { ScopeSwitcher, type ScopeAction } from '../shell/scope-switcher'
import { useGoTo } from './router-shell-link'
import { orgDetail } from './switcher-details'

interface OrgSwitcherProps {
  /** The rail's org avatar or the phone header's org button. */
  trigger: ReactElement
  current: { slug: string; name: string }
  side?: 'bottom' | 'right'
}

/** Switches organization; also New organization and the current org's settings. */
export function OrgSwitcher({ trigger, current, side = 'right' }: OrgSwitcherProps) {
  const [open, setOpen] = useState(false)
  // Asked for when the switcher opens: the frame shows its trigger on every page.
  const orgs = useOrgs({ enabled: open })
  const switchOrg = useSwitchOrg()
  const goTo = useGoTo()

  const actions: ScopeAction[] = [
    { id: 'new', label: 'New organization', icon: Plus, tone: 'primary' },
    { id: 'settings', label: `${current.name} settings`, icon: Settings },
  ]

  function handleSelect(slug: string) {
    if (slug === current.slug) return
    // Not awaited: opening the org only records it as the last one (first on
    // /dashboard next time). The org page resolves its own scope from the
    // URL, so a failure there — say, you were just removed — shows as its
    // "We can't find that organization", not as a stuck switcher.
    switchOrg.mutate(slug)
    goTo(orgPath(slug))
  }

  function handleAction(id: string) {
    // New organization opens its dialog on /dashboard.
    goTo(id === 'new' ? withNewDialog(dashboardPath(), 'org') : orgSettingsPath(current.slug))
  }

  return (
    <ScopeSwitcher
      trigger={trigger}
      label="Switch organization"
      side={side}
      groups={[
        {
          label: 'Organizations',
          items: (orgs.data ?? []).map((org) => ({
            id: org.slug,
            name: org.name,
            detail: orgDetail(org),
            tile: { initial: org.initial },
          })),
        },
      ]}
      currentId={current.slug}
      currentLabel="Current organization"
      onSelect={handleSelect}
      actions={actions}
      onAction={handleAction}
      open={open}
      onOpenChange={setOpen}
    />
  )
}
