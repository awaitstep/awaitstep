import { type ReactNode } from 'react'
import { FlaskConical, Maximize2, X } from 'lucide-react'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { useLastRunSteps } from '../../hooks/use-last-run-steps'
import { useSwitchView } from '../../hooks/use-switch-view'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { cn } from '../../lib/utils'
import { openUsedFile, runStepQuickTest } from '../../lib/ide/step-actions'
import {
  stepSettings,
  stepsForNode,
  summarizeNodeRun,
  versionLabel,
  type LastRunSummary,
} from '../../lib/ide/step-summary'
import { timeAgoOrDay } from '../../lib/time'
import { useIdeStore } from '../../stores/ide-store'
import { useStepSync } from './step-sync-context'

const TONE_CLASS: Record<LastRunSummary['tone'], string> = {
  ok: 'text-status-success',
  error: 'text-status-error',
  active: 'text-status-info',
}

/**
 * What the selected step is and how it last did, read-only. Its code is
 * edited in its source file; its settings are changed on the canvas, which
 * owns the graph — saving them from here would be a second way to write it.
 * The panel mounts only while a step is selected, so the run requests it
 * makes start and stop with it.
 */
export function StepInspector({ nodeId }: { nodeId: string }) {
  const sync = useStepSync()
  const { workflowId, map, nodes, kind, linkVersion } = sync
  const { registry } = useNodeRegistry()
  const switchView = useSwitchView(workflowId)
  const node = nodes.get(nodeId)
  const info = map.byNode.get(nodeId)
  const lastRun = useLastRunSteps(workflowId, node !== undefined)

  if (!node || !info) return null

  const settings = stepSettings(node, { kind })
  const visuals = getNodeVisuals(node.type, registry.get(node.type)?.icon)
  const leader = info.coalescedInto ? nodes.get(info.coalescedInto) : undefined
  const leaderFile = info.coalescedInto
    ? (map.byNode.get(info.coalescedInto)?.filePath ?? null)
    : null

  function handleClose() {
    useIdeStore.getState().selectNode(null)
  }

  function handleRunStep() {
    runStepQuickTest(map, nodeId)
  }

  function handleEditOnCanvas() {
    void switchView('canvas', { version: linkVersion, node: nodeId })
  }

  // Where the step's code runs: its generated module, or why it has none.
  const moduleDescription =
    info.filePath !== null ? (
      <>
        <FileLink path={info.filePath} />
        <span className="text-muted-foreground"> · generated</span>
      </>
    ) : !map.hasManifest ? (
      <span className="text-muted-foreground">No step files in this version</span>
    ) : leader && leaderFile ? (
      <span className="text-muted-foreground">
        Runs inside {leader.name}, in <FileLink path={leaderFile} />
      </span>
    ) : (
      <span className="text-muted-foreground">
        {sync.workflowFile ? (
          <>
            Written in <FileLink path={sync.workflowFile} />
          </>
        ) : (
          'No file of its own'
        )}
      </span>
    )

  return (
    <section
      aria-label={`${node.name} details`}
      className="max-h-[55%] shrink-0 overflow-auto border-b border-border bg-card"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded',
              visuals.accent,
            )}
            aria-hidden
          >
            {visuals.icon}
          </span>
          <h3 className="min-w-0 truncate text-xs font-semibold text-foreground">{node.name}</h3>
          <span className="shrink-0 text-[11px] text-muted-foreground">{kindLabel(node.type)}</span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close step details"
          title="Close step details"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 px-3 py-2.5 text-xs">
        {settings.retries !== null && <Field label="Retries">{settings.retries}</Field>}
        {settings.timeout !== null && <Field label="Timeout">{settings.timeout}</Field>}
        <Field label="File">
          {info.sourcePath !== null ? (
            <>
              <FileLink path={info.sourcePath} />
              <span className="text-muted-foreground"> · step code</span>
            </>
          ) : (
            moduleDescription
          )}
        </Field>
        {info.sourcePath !== null && <Field label="Module">{moduleDescription}</Field>}
        {info.uses.length > 0 && (
          <Field label="Uses">
            <ul className="space-y-0.5">
              {info.uses.map((path) => (
                <li key={path}>
                  <FileLink path={path} />
                </li>
              ))}
            </ul>
          </Field>
        )}
        <Field label="Last run">
          <LastRun nodeId={nodeId} data={lastRun} versions={sync.versions} />
        </Field>
      </dl>
      <div className="flex gap-2 px-3 pb-2.5">
        <ActionButton
          icon={<FlaskConical className="h-3 w-3" />}
          onClick={handleRunStep}
          disabled={info.filePath === null}
          title={
            info.filePath === null
              ? 'This step has no module of its own to run'
              : 'Run this step on its own in Quick test'
          }
        >
          Run step
        </ActionButton>
        <ActionButton
          icon={<Maximize2 className="h-3 w-3" />}
          onClick={handleEditOnCanvas}
          title="Open the canvas on this step, where its settings can be changed"
        >
          Edit on canvas
        </ActionButton>
      </div>
    </section>
  )
}

function kindLabel(type: string): string {
  return type.replace(/_/g, ' ')
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  )
}

function FileLink({ path }: { path: string }) {
  function handleClick() {
    openUsedFile(path)
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="max-w-full truncate rounded font-mono text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary"
    >
      {path}
    </button>
  )
}

function ActionButton({
  icon,
  onClick,
  disabled,
  title,
  children,
}: {
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
    >
      {icon}
      {children}
    </button>
  )
}

function LastRun({
  nodeId,
  data,
  versions,
}: {
  nodeId: string
  data: ReturnType<typeof useLastRunSteps>
  versions: ReturnType<typeof useStepSync>['versions']
}) {
  const { run, steps, coalescedInto, loading, failed } = data
  if (failed) return <span className="text-muted-foreground">Couldn’t load the last run</span>
  if (loading) return <span className="text-muted-foreground">Loading…</span>
  if (run === null) return <span className="text-muted-foreground">No runs yet</span>

  const version =
    run.versionNumber != null ? `v${run.versionNumber}` : versionLabel(run.versionId, versions)
  const when = [timeAgoOrDay(run.createdAt), version].filter(Boolean).join(' · ')
  const summary = summarizeNodeRun(stepsForNode(steps, coalescedInto, nodeId))
  if (summary === null) {
    return <span className="text-muted-foreground">Nothing recorded in the last run · {when}</span>
  }
  return (
    <div className="space-y-0.5">
      <p>
        <span className={cn('font-medium', TONE_CLASS[summary.tone])}>{summary.headline}</span>
        {summary.detail && <span className="text-muted-foreground"> · {summary.detail}</span>}
      </p>
      {summary.error && <p className="break-words font-mono text-[11px]">{summary.error}</p>}
      <p className="text-muted-foreground">
        {summary.occurrences > 1 && `${summary.occurrences} times · `}
        {when}
      </p>
    </div>
  )
}
