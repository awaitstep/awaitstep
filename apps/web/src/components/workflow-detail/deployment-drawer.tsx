import type { ReactNode } from 'react'
import { format } from 'date-fns'
import type { DeploymentSummary } from '../../lib/api-client'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SidePanel } from '../ui/side-panel'
import { useCopyStatus } from '../ui/use-copy-status'
import { DeployLink } from './parts/deploy-link'
import type { DeploymentState, RollBack } from './deployment-rollback'

interface DeploymentDrawerProps {
  open: boolean
  /** The row it shows; kept while it closes, so it doesn't empty mid-slide. */
  deployment: DeploymentSummary | null
  state: DeploymentState | null
  /** The account's name, when the row no longer carries it. */
  accountName: string | null
  /** Roll back to this, when the row could; null hides it. */
  rollBack: RollBack | null
  onClose: () => void
}

const STATE_BADGE: Record<
  DeploymentState,
  { label: string; variant: 'success' | 'error' | 'neutral' }
> = {
  live: { label: 'Live', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  taken_down: { label: 'Taken down', variant: 'neutral' },
  replaced: { label: 'Replaced', variant: 'neutral' },
}

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

const ROLL_BACK_LABEL = { rollback: 'Roll back to this', redeploy: 'Redeploy this' } as const

/**
 * One deploy's details (24h): where it runs, its worker, the version,
 * when and by whom, its IDs, and why it failed; Roll back to this.
 */
export function DeploymentDrawer({
  open,
  deployment: d,
  state,
  accountName,
  rollBack,
  onClose,
}: DeploymentDrawerProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  const version = d?.version != null ? `v${d.version}` : 'A deleted version'
  const account = d?.connectionName ?? accountName ?? 'a removed account'
  const badge = state ? STATE_BADGE[state] : null
  const title = d ? `${version} on ${account}` : ''
  const description = badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null
  const actions = rollBack ? (
    <DeployLink
      href={rollBack.href}
      label={ROLL_BACK_LABEL[rollBack.kind]}
      blockedReason={rollBack.blockedReason}
    />
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={onClose}>
      Close
    </Button>
  )

  return (
    <SidePanel
      open={open && d !== null}
      onOpenChange={handleOpenChange}
      size="md"
      title={title}
      description={description}
      actions={actions}
    >
      {d && (
        <div className="flex flex-col gap-4">
          {d.status === 'failed' && d.error && (
            <pre className="m-0 whitespace-pre-wrap break-words rounded-lg border border-status-error/30 bg-background px-3 py-2.5 font-mono text-sm leading-relaxed text-status-error">
              {d.error}
            </pre>
          )}
          <DetailCard>
            <Detail label="Where it runs">{account}</Detail>
            {d.serviceName && (
              <Detail label="Worker" copy={d.serviceName} mono>
                {d.serviceName}
              </Detail>
            )}
          </DetailCard>
          <DetailCard>
            <Detail label="Version">{version}</Detail>
            <Detail label="Deployed">
              {format(new Date(d.createdAt), 'd MMM yyyy, HH:mm')}
              {d.createdByName ? ` by ${d.createdByName}` : ''}
            </Detail>
            {d.versionId && (
              <Detail label="Version ID" copy={d.versionId} mono>
                {d.versionId}
              </Detail>
            )}
            <Detail label="Deployment ID" copy={d.id} mono>
              {d.id}
            </Detail>
          </DetailCard>
        </div>
      )}
    </SidePanel>
  )
}

function DetailCard({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 flex flex-col gap-3.5 rounded-xl border border-border bg-background/40 px-4 py-3.5">
      {children}
    </dl>
  )
}

function Detail({
  label,
  copy,
  mono,
  children,
}: {
  label: string
  /** The value Copy puts on the clipboard; no Copy without it. */
  copy?: string
  mono?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 flex min-w-0 items-center gap-2">
        <span
          className={
            mono
              ? 'min-w-0 flex-1 break-all font-mono text-xs text-foreground'
              : 'min-w-0 flex-1 break-all text-[13px] text-foreground'
          }
        >
          {children}
        </span>
        {copy && <CopyButton value={copy} label={label} />}
      </dd>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const copy = useCopyStatus(value)

  function handleCopy() {
    void copy.copy()
  }

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto shrink-0 p-0 text-xs"
      aria-label={`Copy the ${label.toLowerCase()}`}
      onClick={handleCopy}
    >
      {COPY_LABEL[copy.status]}
    </Button>
  )
}
