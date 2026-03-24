import * as Popover from '@radix-ui/react-popover'
import { useOrgStore } from '../../stores/org-store'

import { useShallow } from 'zustand/react/shallow'
import { Building2, Check, ChevronDown, Plus, Settings } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useSheetStore } from '../../stores/sheet-store'
import { cn } from '../../lib/utils'

export default function OrgMenu() {
  const [orgOpen, setOrgOpen] = useState(false)

  const { openOrgDialog } = useSheetStore()
  const { setActiveOrganization: setActiveOrg } = useOrgStore()

  function handleNewOrg() {
    setOrgOpen(false)
    openOrgDialog()
  }

  function handleSelectOrg(orgId: string) {
    setOrgOpen(false)
    if (orgId === activeOrganizationId) return
    setActiveOrg(orgId)
  }
  const { activeOrganizationId, activeOrg, orgs } = useOrgStore(
    useShallow((s) => ({
      activeOrganizationId: s.activeOrganizationId,
      activeOrg: s.organizations.find((org) => org.id === s.activeOrganizationId),
      orgs: s.organizations,
    })),
  )

  return (
    <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'flex h-14 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-lg transition-colors',
            orgOpen
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
          )}
        >
          <Building2 size={16} />
          <span className="w-[80px] truncate text-left text-xs font-medium">
            {activeOrg ? (
              activeOrg.name
            ) : (
              <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted/60" />
            )}
          </span>
          <ChevronDown size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-lg"
        >
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Organizations
          </p>
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Building2 size={14} />
              <span className="flex-1 truncate text-left">{org.name}</span>
              {org.id === activeOrg?.id && <Check size={14} className="text-foreground" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-border" />
          <button
            onClick={handleNewOrg}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Plus size={14} />
            <span>New organization</span>
          </button>
          <Link
            to="/settings"
            onClick={() => setOrgOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Settings size={14} />
            <span>Settings</span>
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
