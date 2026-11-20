import { useState } from 'react'
import { useProjectConnectionSummary } from '../../data/dashboard/project-connections'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { Bone } from '../ui/skeletons'
import { AccountSettingCard } from '../connections/account-setting-card'
import { DefaultAccountDialog } from './default-account-dialog'

interface ProjectAccountSectionProps {
  slugs: ProjectSlugs
  orgName: string
  projectName: string
  /** Project admins (and the org's owners and admins) change it; everyone else reads it. */
  canManage: boolean
}

/**
 * Project Settings → General: the Cloudflare account the project deploys to by
 * default, from the connections summary. The picker fetches the lists it offers.
 */
export function ProjectAccountSection({
  slugs,
  orgName,
  projectName,
  canManage,
}: ProjectAccountSectionProps) {
  const summary = useProjectConnectionSummary(slugs.org, slugs.project)
  const [open, setOpen] = useState(false)
  const current = summary.data?.default

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  let body
  if (summary.isError) {
    body = <span className="text-status-error">{summary.error.message}</span>
  } else if (!summary.data) {
    body = <Bone className="h-5 w-40 rounded" />
  } else if (current) {
    body = (
      <>
        <span className="font-medium text-foreground">{current.name}</span>
        {current.accountSuffix && (
          <span className="text-xs text-muted-foreground">
            Cloudflare account ••••{current.accountSuffix}
          </span>
        )}
      </>
    )
  } else {
    body = (
      <>
        <span className="font-medium text-foreground">None yet</span>
        <span className="text-xs text-muted-foreground">Deploy asks which account to use.</span>
      </>
    )
  }

  const action =
    canManage && summary.data ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Change the default Cloudflare account"
        onClick={handleOpen}
      >
        Change
      </Button>
    ) : undefined

  return (
    <>
      <AccountSettingCard title="Cloudflare account" action={action}>
        {body}
      </AccountSettingCard>
      {open && summary.data && (
        <DefaultAccountDialog
          slugs={slugs}
          orgName={orgName}
          projectName={projectName}
          currentId={summary.data.default?.id ?? null}
          onClose={handleClose}
        />
      )}
    </>
  )
}
