import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, Square, X } from 'lucide-react'
import type { TestSession } from '../../lib/api-client'
import { useApi } from '../../contexts/api-client-context'
import { useTestInstance, type TestInstanceState } from '../../hooks/use-test-instance'
import { formatBody, isFinalInstanceStatus } from '../../lib/ide/session-log'
import {
  instanceStatusLabel,
  instanceStepList,
  parseEventForm,
  parseInstanceId,
  stepExtrasOf,
  testStepById,
  waitEventTypes,
  type InstanceView,
  type KnownInstance,
} from '../../lib/ide/test-instance'
import { flatSteps, focusStep } from '../../lib/run-step-list'
import { RunStepsCard } from '../monitoring/run-steps-card'
import { StepDetail } from '../monitoring/run-step-panel'
import { Badge, type BadgeProps } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { PANE_HEADER } from './session-bars'

interface WorkflowGraph {
  nodes: Array<{ id: string; name: string; type: string; data?: Record<string, unknown> }>
  edges: unknown[]
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  complete: 'success',
  errored: 'error',
  terminated: 'neutral',
  waiting: 'info',
  running: 'warning',
  queued: 'warning',
}

/**
 * The instance a test triggered, beside its Output: where it is, its steps
 * (on runners that keep them), and the two things a test does to it — send
 * it an event, or end it.
 */
export function InstancePane({
  session,
  onClose,
}: {
  session: TestSession
  /** Shown when the pane opens over Output in a narrow dock. */
  onClose?: () => void
}) {
  const api = useApi()
  const state = useTestInstance(session)
  const { data: version } = useQuery({
    // A save onto an undeployed version keeps its id: the graph's hash tells the saves apart.
    queryKey: [
      'workflow-version',
      session.workflowId,
      session.versionId,
      session.graphHash ?? null,
    ],
    queryFn: () => api.getVersion(session.workflowId ?? '', session.versionId ?? ''),
    enabled: Boolean(session.workflowId && session.versionId),
    staleTime: Infinity,
  })
  const graph = useMemo<WorkflowGraph | null>(() => {
    if (!version) return null
    try {
      return JSON.parse(version.ir) as WorkflowGraph
    } catch {
      return null
    }
  }, [version])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={PANE_HEADER}>
        <span className="shrink-0 text-2xs font-medium text-foreground">Instance</span>
        <InstancePicker state={state} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide instance"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {state.selected ? (
          <SelectedInstance
            key={state.selected.id}
            session={session}
            instance={state.selected}
            state={state}
            graph={graph}
          />
        ) : (
          <p className="text-2xs text-muted-foreground">
            Trigger the workflow to watch its instance here, or paste an instance id.
          </p>
        )}
      </div>
    </div>
  )
}

function InstancePicker({ state }: { state: TestInstanceState }) {
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const options = state.instances.map((known) => ({
    value: known.id,
    label: known.id,
    description: instanceStatusLabel(known.view),
  }))

  function handlePick(id: string) {
    state.select(id)
  }

  function handlePasted(event: React.ChangeEvent<HTMLInputElement>) {
    setPasted(event.target.value)
    if (error) setError(null)
  }

  function handlePasteKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    const parsed = parseInstanceId(pasted)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    state.select(parsed.id)
    setPasted('')
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {options.length > 0 && (
        <Select
          aria-label="Instance"
          value={state.selected?.id ?? ''}
          onValueChange={handlePick}
          options={options}
          className="h-6 min-w-0 max-w-56 flex-1 px-2 text-2xs"
        />
      )}
      <Input
        value={pasted}
        onChange={handlePasted}
        onKeyDown={handlePasteKey}
        placeholder="Paste an instance id"
        aria-label="Paste an instance id"
        aria-invalid={error !== null}
        title={error ?? 'Press Enter to watch it'}
        spellCheck={false}
        className="h-6 min-w-24 flex-1 px-2 font-mono text-2xs"
      />
    </div>
  )
}

function SelectedInstance({
  session,
  instance,
  state,
  graph,
}: {
  session: TestSession
  instance: KnownInstance
  state: TestInstanceState
  graph: WorkflowGraph | null
}) {
  const view = instance.view
  const status = view?.status
  const settled = isFinalInstanceStatus(status)
  const canTerminate = session.capabilities?.terminate === true && !settled && view !== undefined

  function handleTerminate() {
    void state.terminate()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={(status && STATUS_VARIANT[status]) || 'neutral'}>
          {instanceStatusLabel(view)}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          {instance.id}
        </span>
        {canTerminate && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-2xs"
            disabled={state.terminating}
            onClick={handleTerminate}
          >
            <Square className="h-3 w-3" />
            {state.terminating ? 'Terminating…' : 'Terminate'}
          </Button>
        )}
      </div>
      <InstanceResult view={view} />
      <InstanceSteps session={session} instanceId={instance.id} view={view} graph={graph} />
      {!settled && <SendEventForm state={state} graph={graph} />}
    </div>
  )
}

function InstanceResult({ view }: { view: InstanceView | undefined }) {
  if (view?.status === 'complete' && view.output !== undefined && view.output !== null) {
    return (
      <pre className="max-h-40 overflow-auto rounded border border-border bg-editor p-2 font-mono text-2xs">
        {formatBody(view.output)}
      </pre>
    )
  }
  if (view?.status === 'errored' && view.error) {
    const error = view.error
    const text =
      typeof error === 'string' ? error : [error.name, error.message].filter(Boolean).join(': ')
    return (
      <pre className="whitespace-pre-wrap rounded border border-status-error/25 bg-editor p-2 font-mono text-2xs text-status-error">
        {text}
      </pre>
    )
  }
  return null
}

function InstanceSteps({
  session,
  instanceId,
  view,
  graph,
}: {
  session: TestSession
  instanceId: string
  view: InstanceView | undefined
  graph: WorkflowGraph | null
}) {
  const [picked, setPicked] = useState<string | undefined>(undefined)
  if (session.capabilities?.steps !== true) {
    return (
      <p className="text-2xs text-muted-foreground">
        Steps show on Cloud test runs. This runner reports the instance’s status only.
      </p>
    )
  }
  const runStatus = view?.status ?? 'running'
  const { entries, spanMs } = instanceStepList(view, instanceId, graph)
  const items = flatSteps(entries)
  const focus = focusStep(items, runStatus)
  // Until someone picks one, the detail follows where the instance is.
  const selected = items.find((item) => item.id === picked) ?? focus
  const step = testStepById(view?.steps, selected?.id)

  return (
    <div className="flex flex-col gap-3">
      {view?.stepsIncomplete && (
        <p className="text-2xs text-muted-foreground">
          Earlier steps of this instance weren’t kept.
        </p>
      )}
      <RunStepsCard
        entries={entries}
        spanMs={spanMs}
        loaded={view !== undefined}
        runStatus={runStatus}
        selectedId={selected?.id}
        onSelect={setPicked}
        focus={focus}
      />
      {selected && step && <StepDetail item={selected} extras={stepExtrasOf(step)} cutAt="8 KB" />}
    </div>
  )
}

function SendEventForm({
  state,
  graph,
}: {
  state: TestInstanceState
  graph: WorkflowGraph | null
}) {
  const suggestions = waitEventTypes(graph)
  const [type, setType] = useState('')
  const [payload, setPayload] = useState('{}')
  const [error, setError] = useState<string | null>(null)

  // A graph not read yet may still have waits; one read without them has nothing to send to.
  if (graph && suggestions.length === 0) return null

  function handleType(event: React.ChangeEvent<HTMLInputElement>) {
    setType(event.target.value)
    if (error) setError(null)
  }

  function handlePayload(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setPayload(event.target.value)
    if (error) setError(null)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const form = parseEventForm(type || (suggestions[0] ?? ''), payload)
    if (!form.ok) {
      setError(form.error)
      return
    }
    void state.sendEvent(form.type, form.payload)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border-t border-border pt-3"
      aria-label="Send an event"
    >
      <span className="text-2xs font-medium text-foreground">Send an event</span>
      <Input
        value={type}
        onChange={handleType}
        list="instance-event-types"
        placeholder={suggestions[0] ?? 'Event type'}
        aria-label="Event type"
        spellCheck={false}
        className="h-7 px-2 font-mono text-2xs"
      />
      <datalist id="instance-event-types">
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <Textarea
        value={payload}
        onChange={handlePayload}
        aria-label="Event payload"
        aria-invalid={error !== null}
        spellCheck={false}
        className="min-h-16 font-mono text-2xs"
      />
      {error && (
        <p role="alert" className="text-2xs text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-6 self-start px-2 text-2xs"
        disabled={state.sending}
      >
        <Send className="h-3 w-3" />
        {state.sending ? 'Sending…' : 'Send event'}
      </Button>
    </form>
  )
}
