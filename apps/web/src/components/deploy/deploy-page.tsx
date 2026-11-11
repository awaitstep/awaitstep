import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cable, XCircle } from 'lucide-react'
import type { DeploymentConfigUiSchema } from '@awaitstep/codegen'
import { projectPagePath } from '../../lib/dashboard-paths'
import { useItemSlugs } from '../../contexts/editor-scope-context'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useDeployStream } from '../../hooks/use-deploy-stream'
import { useApi, useQueries, useApiReady } from '../../contexts/api-client-context'
import { cn } from '../../lib/utils'
import { Button, buttonVariants } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { Bone } from '../ui/skeletons'
import { DeployAccountCard, providerName } from './deploy-account-card'
import { phaseOfStage, type DeployOutcome } from './deploy-phases'
import { DeployPreviewCard } from './deploy-preview-card'
import { DeployProgressCard } from './deploy-progress-card'
import { DeploySettings } from './deploy-settings'
import {
  buildHints,
  resetToDefaults,
  settingChanges,
  withoutBlankItems,
} from './deploy-settings-model'
import { DeploySummaryCard } from './deploy-summary-card'

type Config = Record<string, unknown>

interface DeployPageProps {
  workflowId: string
  versionId?: string
  /** The number of the version this deploy sends, when known. */
  version?: number
  /** The account to start on (Roll back on one account's row), when it is one offered. */
  connectionId?: string
  kind?: 'workflow' | 'script'
}

const LOCKED_HERE = 'The version deployed on this account is locked.'
const NO_SETTINGS: DeploymentConfigUiSchema = { groups: [] }

/**
 * Deploy on one screen (25a–25f): the account and every setting on the left,
 * what this deploy changes and its progress on the right.
 */
export function DeployPage({
  workflowId,
  versionId,
  version,
  connectionId: linkedConnectionId,
  kind,
}: DeployPageProps) {
  const api = useApi()
  const queries = useQueries()
  const ready = useApiReady()
  // Only the project's accounts, with its workspace's (else the project's) default
  // chosen: the API refuses a deploy with any other (23a).
  const targets = useQuery({ ...queries.connections.forDeploy(workflowId), enabled: ready })
  const slugs = useItemSlugs()
  const connectionsHref = projectPagePath(slugs, 'connections')
  const links = useWorkflowLinks(workflowId)
  const accounts = targets.data?.connections
  const [picked, setPicked] = useState<string | null>(null)
  const linked = accounts?.some((c) => c.id === linkedConnectionId) ? linkedConnectionId : undefined
  const connectionId = picked ?? linked ?? targets.data?.defaultId ?? ''
  // Edits belong to the account they were made for; another account starts from its own.
  const [edits, setEdits] = useState<{ connectionId: string; config: Config } | null>(null)

  const stream = useDeployStream({ workflowId, versionId })
  const busy = stream.state !== 'idle'

  const settings = useQuery({
    queryKey: ['deploy-config', workflowId, connectionId],
    queryFn: () => api.getDeployConfig(workflowId, connectionId),
    enabled: ready && !!connectionId,
  })
  // A provider without a settings schema has nothing to show here, but can still deploy.
  const schema = useMemo(
    () => (settings.data ? (settings.data.uiSchema ?? NO_SETTINGS) : undefined),
    [settings.data],
  )
  const hints = useMemo(() => buildHints(schema ?? NO_SETTINGS), [schema])
  const stored = settings.data?.config
  const edited = edits?.connectionId === connectionId ? edits.config : (stored ?? {})
  // What is sent, compared and previewed: list items left blank are dropped.
  const config = useMemo(
    () => (schema ? withoutBlankItems(schema, edited, hints) : edited),
    [schema, edited, hints],
  )
  const selected = accounts?.find((c) => c.id === connectionId)
  const live = targets.data?.deployedWith.find((d) => d.id === connectionId)
  const changes = schema && stored ? settingChanges(schema, config, stored, hints) : null

  function handlePick(id: string) {
    setPicked(id)
  }

  function handleChange(next: Config) {
    setEdits({ connectionId, config: next })
  }

  function handleReset() {
    if (schema && settings.data) {
      setEdits({ connectionId, config: resetToDefaults(schema, edited, settings.data.defaults) })
    }
  }

  function handleDeploy() {
    if (connectionId) void stream.startDeploy(connectionId, config)
  }

  function handleRetryTargets() {
    void targets.refetch()
  }

  function handleRetrySettings() {
    void settings.refetch()
  }

  if (targets.isError) {
    return (
      <EmptyState
        icon={XCircle}
        title="Couldn’t load the accounts"
        description={targets.error.message}
        action={
          <Button variant="outline" size="sm" onClick={handleRetryTargets}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!accounts) return <DeployPageSkeleton />

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title="No account connected yet"
        description="Deploy stays disabled until this project can reach a Cloudflare account. Add one on the project’s Connections page."
        action={
          connectionsHref ? (
            <a
              href={connectionsHref}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open Connections
            </a>
          ) : undefined
        }
      />
    )
  }

  let settingsBody
  if (!connectionId) {
    settingsBody = (
      <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        Pick an account to see its settings.
      </p>
    )
  } else if (settings.isError) {
    settingsBody = (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground"
      >
        <span className="flex-1">Couldn’t load the settings. {settings.error.message}</span>
        <Button variant="outline" size="sm" onClick={handleRetrySettings}>
          Try again
        </Button>
      </div>
    )
  } else if (!settings.data || !schema) {
    settingsBody = <Bone className="h-80 w-full rounded-2xl" />
  } else {
    settingsBody = (
      <DeploySettings
        schema={schema}
        config={edited}
        defaults={settings.data.defaults}
        hints={hints}
        onChange={handleChange}
        onReset={handleReset}
      />
    )
  }

  let outcome: DeployOutcome = 'deploying'
  if (stream.state === 'success') outcome = 'success'
  else if (stream.state === 'error') outcome = stream.failure === 'connection' ? 'lost' : 'error'
  const verb = kind === 'script' ? 'Publish' : 'Deploy'
  const blockedReason = live?.versionLocked ? LOCKED_HERE : undefined
  const provider = providerName(selected?.provider ?? 'cloudflare')

  return (
    <div className="flex flex-wrap items-start gap-5">
      <fieldset
        disabled={busy}
        className={cn('flex min-w-0 flex-[1.6_1_460px] flex-col gap-5', busy && 'opacity-50')}
      >
        <legend className="sr-only">Account and settings</legend>
        <DeployAccountCard
          accounts={accounts}
          selectedId={connectionId}
          defaultId={targets.data?.defaultId ?? null}
          connectionsHref={connectionsHref}
          disabled={busy}
          onPick={handlePick}
        />
        {settingsBody}
      </fieldset>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        {busy ? (
          <DeployProgressCard
            outcome={outcome}
            reached={phaseOfStage(stream.reachedStage)}
            version={version}
            accountName={selected?.name}
            providerName={provider}
            startedAt={stream.startedAt}
            finishedAt={stream.finishedAt}
            workflowId={workflowId}
            dashboardUrl={stream.result?.dashboardUrl}
            kind={kind}
            error={stream.error}
            liveVersion={live?.version ?? null}
            deploymentsHref={links.deployments}
            overviewHref={links.overview}
            onRetry={handleDeploy}
            onBack={stream.retry}
          />
        ) : (
          <DeploySummaryCard
            workflowId={workflowId}
            version={version}
            live={live}
            accountName={selected?.name}
            changes={changes}
            verb={verb}
            blockedReason={blockedReason}
            pending={!settings.data}
            cancelHref={links.overview}
            onDeploy={handleDeploy}
          />
        )}
        {connectionId && settings.data && (
          <DeployPreviewCard
            workflowId={workflowId}
            connectionId={connectionId}
            config={config}
            filename={settings.data.preview.filename}
          />
        )}
      </div>
    </div>
  )
}

function DeployPageSkeleton() {
  return (
    <div className="flex flex-wrap items-start gap-5" aria-busy="true">
      <div className="flex min-w-0 flex-[1.6_1_460px] flex-col gap-5">
        <Bone className="h-[74px] w-full rounded-2xl" />
        <Bone className="h-80 w-full rounded-2xl" />
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <Bone className="h-72 w-full rounded-2xl" />
        <Bone className="h-12 w-full rounded-2xl" />
      </div>
    </div>
  )
}
