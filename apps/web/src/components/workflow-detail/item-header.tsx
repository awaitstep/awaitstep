import { useState } from 'react'
import { Lock, Pencil, Play } from 'lucide-react'
import type { WorkflowSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { TriggerDialog } from '../canvas/trigger-dialog'
import type { ItemDetailPage } from '../navigation/dashboard-page'
import { RouterShellLink } from '../navigation/router-shell-link'
import { DeployButton } from '../overview/deploy-action'
import { EditableDescription, EditableName } from '../overview/editable-field'
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
  /** Run counts for the tabs, when known; none on a draft's tabs. */
  counts?: { runs?: number; deployments?: number }
  /** Never deployed: the Draft pill (24f, 24g). */
  neverDeployed: boolean
  /** The viewer may edit here; else the name and description are plain text. */
  canEdit: boolean
}

/**
 * A workflow or function's head (boards `WorkflowDetail`, `FunctionDetail`):
 * its name and state, Open editor · Deploy · Trigger · ⋯, the lock banner,
 * and its Overview/Runs/Deployments tabs. Both kinds read the same.
 */
export function ItemHeader({
  slugs,
  workflow,
  overview,
  page,
  counts,
  neverDeployed,
  canEdit,
}: ItemHeaderProps) {
  const links = useWorkflowLinks(workflow.id)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const isFunction = workflow.kind === 'script'
  const locked = overview.deployedVersion?.locked === 1
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
            <EditableName
              workflowId={workflow.id}
              initialValue={workflow.name}
              readOnly={!canEdit}
              className="-ml-2 text-2xl tracking-tight"
            />
            {isFunction && (
              <Badge variant="info" title={FUNCTION_BADGE_TITLE}>
                Function
              </Badge>
            )}
            {/* Live reads in the band below; only a draft says so up here (24a, 24f). */}
            {neverDeployed && <StatusPill status="draft" />}
            {locked && (
              <Badge variant="warning">
                <Lock aria-hidden="true" className="size-3" />
                Locked
              </Badge>
            )}
          </div>
          {/* Edited in place, as v1's overview did: the only place to rename it. */}
          <EditableDescription
            workflowId={workflow.id}
            initialValue={workflow.description ?? ''}
            readOnly={!canEdit}
            className="-ml-2 text-sm"
          />
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
              deployBlocked={overview.deployBlocked}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Trigger a run"
              title={
                isFunction
                  ? 'Functions run when called at their URL'
                  : overview.hasActiveDeployment
                    ? 'Trigger a run'
                    : 'Deploy it first'
              }
              disabled={isFunction || !overview.hasActiveDeployment}
              onClick={handleOpenTrigger}
            >
              <Play aria-hidden="true" className="size-3.5" />
            </Button>
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
          versionId={overview.deployedVersion?.id}
          version={live}
        />
      )}
      <LinkTabs label="Item pages" tabs={tabs} activeKey={tabKey(page)} />
      {triggerOpen && <TriggerDialog workflowId={workflow.id} onClose={handleCloseTrigger} />}
    </div>
  )
}

/** A run belongs to the Runs tab; Deploy is none of them. */
function tabKey(page: ItemDetailPage): string {
  return page === 'run' ? 'runs' : page
}

/**
 * The newest live version is locked: what that stops, and the way out. It is
 * the version lock the Versions list always had; only replacing it on the
 * accounts it runs on is off.
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
        v{version} is locked · it can’t be replaced where it’s live
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
