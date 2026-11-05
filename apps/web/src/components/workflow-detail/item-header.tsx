import { useState } from 'react'
import { Lock, Pencil, Play } from 'lucide-react'
import type { WorkflowSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { TriggerDialog } from '../canvas/trigger-dialog'
import type { ItemDetailPage } from '../navigation/dashboard-page'
import { RouterShellLink } from '../navigation/router-shell-link'
import { DeployButton } from '../overview/deploy-action'
import { Badge } from '../ui/badge'
import { Button, buttonVariants } from '../ui/button'
import { LinkTabs, type LinkTab } from '../ui/link-tabs'
import { StatusPill } from '../ui/status-pill'
import { FUNCTION_BADGE_TITLE } from '../workflows/function-copy'
import { ItemActionsMenu } from './item-actions-menu'
import { useLockDeployed } from './use-lock-deployed'
import type { WorkflowOverview } from './use-workflow-overview'

interface ItemHeaderProps {
  slugs: WorkspaceSlugs
  workflow: WorkflowSummary
  overview: WorkflowOverview
  page: ItemDetailPage
  /** Run counts for the tabs, when known. */
  counts?: { runs?: number; deployments?: number }
}

/**
 * A workflow or function's head (boards `WorkflowDetail`, `FunctionDetail`):
 * its name and state, Open editor · Deploy · Trigger · ⋯, the lock banner,
 * and for a workflow its tabs.
 */
export function ItemHeader({ slugs, workflow, overview, page, counts }: ItemHeaderProps) {
  const links = useWorkflowLinks(workflow.id)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const isFunction = workflow.kind === 'script'
  const locked = overview.deployBlocked
  const live = overview.deployedVersion?.version
  // Deploy is the page's own action there; a run has its own.
  const showActions = page !== 'deploy' && page !== 'run'
  const editorHref = links.editor(workflow.currentVersionId ? 'ide' : 'canvas')

  function handleOpenTrigger() {
    setTriggerOpen(true)
  }

  function handleCloseTrigger() {
    setTriggerOpen(false)
  }

  const tabs: LinkTab[] = [
    { key: 'overview', label: 'Overview', href: links.overview },
    { key: 'runs', label: 'Runs', href: links.runs, count: counts?.runs },
    {
      key: 'deployments',
      label: 'Deployments',
      href: links.deployments,
      count: counts?.deployments,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{workflow.name}</h1>
            {isFunction && (
              <Badge variant="info" title={FUNCTION_BADGE_TITLE}>
                Function
              </Badge>
            )}
            {live !== undefined ? (
              <StatusPill status="deployed">Deployed v{live}</StatusPill>
            ) : (
              <StatusPill status="draft" />
            )}
            {isFunction && workflow.sharedBy && (
              <Badge variant="neutral">Shared with the project</Badge>
            )}
            {locked && (
              <Badge variant="warning">
                <Lock aria-hidden="true" className="size-3" />
                Locked
              </Badge>
            )}
          </div>
          {workflow.description && (
            <p className="text-sm text-muted-foreground">{workflow.description}</p>
          )}
        </div>
        {showActions && (
          <div className="flex shrink-0 items-center gap-2">
            <RouterShellLink
              href={editorHref}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              Open editor
            </RouterShellLink>
            <DeployButton
              workflowId={workflow.id}
              currentVersionId={workflow.currentVersionId}
              kind={workflow.kind}
              deployBlocked={locked}
            />
            {!isFunction && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Trigger a run"
                title={overview.hasActiveDeployment ? 'Trigger a run' : 'Deploy it first'}
                disabled={!overview.hasActiveDeployment}
                onClick={handleOpenTrigger}
              >
                <Play aria-hidden="true" className="size-3.5" />
              </Button>
            )}
            <ItemActionsMenu
              slugs={slugs}
              workflow={workflow}
              overview={overview}
              runCount={counts?.runs}
            />
          </div>
        )}
      </div>
      {locked && live !== undefined && (
        <LockBanner
          workflowId={workflow.id}
          versionId={overview.activeDeployment?.versionId}
          version={live}
        />
      )}
      {!isFunction && <LinkTabs label="Workflow pages" tabs={tabs} activeKey={tabKey(page)} />}
      {triggerOpen && (
        <TriggerDialog
          workflowId={workflow.id}
          deployedVersion={live}
          onClose={handleCloseTrigger}
        />
      )}
    </div>
  )
}

/** A run belongs to the Runs tab; Deploy is none of them. */
function tabKey(page: ItemDetailPage): string {
  return page === 'run' ? 'runs' : page
}

/**
 * The deployed version is locked: what that stops, and the way out. It is the
 * version lock the Versions list always had, so only deploying is off.
 */
interface LockBannerProps {
  workflowId: string
  versionId: string | undefined
  version: number
}

function LockBanner({ workflowId, versionId, version }: LockBannerProps) {
  const lock = useLockDeployed(workflowId, versionId)

  function handleUnlock() {
    lock.mutate(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3">
      <Lock aria-hidden="true" className="size-4 shrink-0 text-status-warning" />
      <p className="flex-1 text-sm text-foreground">
        v{version} is locked · deploying another version is off
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleUnlock}
        loading={lock.isPending}
      >
        Unlock
      </Button>
    </div>
  )
}
