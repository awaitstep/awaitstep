import type { ReactNode } from 'react'
import { Rocket } from 'lucide-react'
import type { LiveDeployment } from '@awaitstep/ir'
import { plural } from '../../lib/plural'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import { Button, buttonVariants } from '../ui/button'
import { Bone } from '../ui/skeletons'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { RouterShellLink } from '../navigation/router-shell-link'
import type { SettingChange } from './deploy-settings-model'

interface DeploySummaryCardProps {
  /** The version this deploy sends. */
  version: number | undefined
  /** What is live on the chosen account; none on a first deploy there. */
  live: LiveDeployment | undefined
  accountName: string | undefined
  /** How the settings differ from those of the deploy live there; null until they load. */
  changes: SettingChange[] | null
  /** A function publishes; a workflow deploys. */
  verb: 'Deploy' | 'Publish'
  /** Why it can't go out (the version live there is locked). */
  blockedReason?: string
  /** Nothing to send yet: the settings are still loading. */
  pending: boolean
  cancelHref: string
  onDeploy: () => void
}

function versionLine(version: number | undefined, live: LiveDeployment | undefined): string {
  const v = version !== undefined ? `v${version}` : 'This version'
  if (!live) return `${v}, the first deploy to this account`
  const when = timeAgo(live.deployedAt)
  if (live.version === version) return `Redeploys ${v}, deployed ${when}`
  return live.version !== null
    ? `${v} replaces v${live.version}, deployed ${when}`
    : `${v} replaces the version deployed ${when}`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-2.5 text-[13px]">
      <span className="w-[72px] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all text-foreground">{children}</span>
    </span>
  )
}

/** "What this deploy does" (25a): version, where it's served, the account, and what changes. */
export function DeploySummaryCard({
  version,
  live,
  accountName,
  changes,
  verb,
  blockedReason,
  pending,
  cancelHref,
  onDeploy,
}: DeploySummaryCardProps) {
  const label = version !== undefined ? `${verb} v${version}` : verb
  const servedAt = live?.serviceUrl
    ? live.serviceUrl.replace(/^https?:\/\//, '')
    : 'Shown after the first deploy'
  const disabled = pending || blockedReason !== undefined
  let foot: string | null = null
  if (blockedReason) foot = blockedReason
  else if (live?.version != null) foot = `v${live.version} keeps serving until this one is live.`

  return (
    <OverviewCard title="What this deploy does">
      <div className="flex flex-col gap-3 px-5 py-4">
        <Row label="Version">{versionLine(version, live)}</Row>
        <Row label="Served at">{servedAt}</Row>
        <Row label="Account">{accountName ?? '—'}</Row>
      </div>
      <ChangesBlock live={live} changes={changes} />
      <div className="flex flex-col gap-2.5 border-t border-border bg-muted/20 px-5 py-4">
        <Button type="button" size="lg" disabled={disabled} onClick={onDeploy}>
          <Rocket aria-hidden="true" />
          {label}
        </Button>
        <RouterShellLink
          href={cancelHref}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          Cancel
        </RouterShellLink>
        {foot && <span className="text-center text-xs text-muted-foreground">{foot}</span>}
      </div>
    </OverviewCard>
  )
}

function ChangesBlock({ live, changes }: Pick<DeploySummaryCardProps, 'live' | 'changes'>) {
  if (changes === null) {
    return (
      <div className="border-t border-border px-5 py-3.5">
        <Bone className="h-4 w-48" />
      </div>
    )
  }
  let title: string
  let dot: string
  if (!live) {
    title = 'First deploy to this account'
    dot = 'bg-muted-foreground/60'
  } else if (changes.length === 0) {
    title = 'Same as what is live'
    dot = 'bg-status-success'
  } else {
    title = `${plural(changes.length, 'change')} from the live deployment`
    dot = 'bg-status-warning'
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border px-5 py-3.5">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', dot)} />
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
      </span>
      {live && changes.length > 0 && (
        <>
          <ul className="flex flex-col gap-1">
            {changes.map((change, i) => (
              <li key={`${change.what}-${i}`} className="flex gap-2 text-[12.5px] leading-normal">
                <span aria-hidden="true" className="text-status-warning">
                  ·
                </span>
                <span className="text-muted-foreground">
                  <b className="font-semibold text-foreground">{change.what}</b> {change.now}{' '}
                  <span className="text-muted-foreground/80">(was {change.before})</span>
                </span>
              </li>
            ))}
          </ul>
          <span className="text-[12.5px] text-muted-foreground">
            Everything else matches the live deployment.
          </span>
        </>
      )}
    </div>
  )
}
