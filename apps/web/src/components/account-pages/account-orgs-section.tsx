import { useState } from 'react'
import { useLeaveOrg } from '../../data/dashboard/account'
import { chooseOrgPath, orgSettingsPath } from '../../lib/dashboard-paths'
import type { AccountOrg } from '../../types/dashboard/account'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ListCard, ListRow } from '../ui/list-card'
import { SectionHeader } from '../ui/section-header'
import { ShellLink } from '../ui/shell-link'
import { OrgMark } from '../shell/org-mark'
import { useGoTo } from '../navigation/router-shell-link'
import { orgMeta } from './account-format'

interface AccountOrgsSectionProps {
  /** The org in the URL: leaving it lands on Choose an organization. */
  currentOrg: string
  orgs: AccountOrg[]
}

/** Organizations (`AccountProfile`): where you're a member, and leaving one. */
export function AccountOrgsSection({ currentOrg, orgs }: AccountOrgsSectionProps) {
  const leave = useLeaveOrg(currentOrg)
  const goTo = useGoTo()
  const [leaving, setLeaving] = useState<AccountOrg | null>(null)

  function handleAskLeave(org: AccountOrg) {
    leave.reset()
    setLeaving(org)
  }

  function handleOpenChange(open: boolean) {
    if (!open) setLeaving(null)
  }

  function handleLeave() {
    if (!leaving) return
    const slug = leaving.slug
    leave.mutate(slug, {
      onSuccess: () => {
        setLeaving(null)
        if (slug === currentOrg) goTo(chooseOrgPath())
      },
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Organizations" caption="Where you’re a member" />
      <ListCard label="Organizations" empty="You’re not in any organization.">
        {orgs.map((org) => (
          <ListRow
            key={org.id}
            leading={
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground"
              >
                <OrgMark initial={org.initial} logo={org.logo} />
              </span>
            }
            title={org.name}
            description={orgMeta(org)}
            trailing={
              org.onlyOwner ? (
                <OnlyOwnerNote slug={org.slug} />
              ) : (
                <LeaveButton org={org} onLeave={handleAskLeave} />
              )
            }
          />
        ))}
      </ListCard>
      {leaving && (
        <ConfirmDialog
          open
          onOpenChange={handleOpenChange}
          title={`Leave ${leaving.name}?`}
          description={
            leave.error?.message ??
            'You lose access to its projects right away. API keys you created there keep working until an admin revokes them. To come back, someone has to invite you again.'
          }
          cancelLabel="Stay"
          confirmLabel="Leave organization"
          variant="destructive"
          onConfirm={handleLeave}
          loading={leave.isPending}
        />
      )}
    </section>
  )
}

function OnlyOwnerNote({ slug }: { slug: string }) {
  return (
    <span className="max-w-[220px] text-right text-2xs text-muted-foreground">
      Only owner. Transfer ownership in{' '}
      <ShellLink
        href={orgSettingsPath(slug, 'members')}
        className="text-status-success hover:underline"
      >
        Members
      </ShellLink>{' '}
      to leave.
    </span>
  )
}

function LeaveButton({ org, onLeave }: { org: AccountOrg; onLeave: (org: AccountOrg) => void }) {
  function handleClick() {
    onLeave(org)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Leave ${org.name}`}
      onClick={handleClick}
    >
      Leave
    </Button>
  )
}
