import { useMemo, useState } from 'react'
import { FlaskConical, Loader2, Play } from 'lucide-react'
import {
  parseQuickTestArgs,
  parseStepModule,
  quickTestRefusal,
  seedEnv,
  seedInputs,
  stepModuleVarName,
  type QuickTestField,
} from '../../lib/ide/quick-test'
import { refusedResult, runQuickTest, type QuickTestResult } from '../../lib/ide/quick-test-runner'
import { quickTestKey, quickTestView, useQuickTestStore } from '../../stores/quick-test-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

interface QuickTestPanelProps {
  workflowId: string
  /** The file in the editor, with any unsaved edits already applied. */
  activeFile: { path: string; source: string } | null
}

/**
 * Runs the open step module on its own, against made-up inputs.
 *
 * Deliberately about the file in the editor rather than the workflow: the
 * Run tab next door starts a real worker for the whole graph, and the gap
 * this fills is the one between changing three lines of a transform and
 * wanting to know whether they work.
 */
export function QuickTestPanel({ workflowId, activeFile }: QuickTestPanelProps) {
  const path = activeFile?.path ?? null
  const source = activeFile?.source ?? ''
  const key = path === null ? null : quickTestKey(workflowId, path)
  // Only this file's slice: the store holds every file's state, and
  // subscribing to all of it re-rendered the panel on any keystroke
  // anywhere. Actions are read through getState — they never change.
  const view = useQuickTestStore((s) => quickTestView(s.views, key))
  const envVars = useWorkflowStore((s) => s.workflowEnvVars)
  // Remembered against the file it was judged on, so switching tabs cannot
  // leave "Not valid JSON" sitting over another file's perfectly good text.
  const [invalid, setInvalid] = useState<{ path: string; field: QuickTestField } | null>(null)
  const invalidField = invalid?.path === path ? invalid.field : null

  const isStepModule = path !== null && stepModuleVarName(path) !== null
  const shape = useMemo(
    () => (isStepModule ? parseStepModule(source) : null),
    [isStepModule, source],
  )
  const refusal = shape ? quickTestRefusal(shape) : null

  // Derived from the file as it stands rather than copied into the store:
  // the names a body destructures change while it is being edited.
  const seeds = useMemo(
    () => ({
      inputs: JSON.stringify(seedInputs(shape?.inputNames ?? []), null, 2),
      env: JSON.stringify(seedEnv(envVars), null, 2),
      event: JSON.stringify({ payload: {} }, null, 2),
    }),
    [shape, envVars],
  )
  const fields: Record<QuickTestField, string> = {
    inputs: view.inputs ?? seeds.inputs,
    env: view.env ?? seeds.env,
    event: view.event ?? seeds.event,
  }

  function handleFieldChange(storeKey: string, field: QuickTestField, text: string) {
    useQuickTestStore.getState().setField(storeKey, field, text)
  }

  function handleRun() {
    if (path === null || key === null) return
    const parsed = parseQuickTestArgs(fields)
    if (!parsed.ok) {
      setInvalid({ path, field: parsed.field })
      return
    }
    setInvalid(null)
    const { beginRun, settleRun } = useQuickTestStore.getState()
    const run = beginRun(key)
    void runQuickTest({ path, source, args: parsed.args, signal: run.signal })
      // An aborted run has no outcome worth showing; settleRun drops it
      // either way, since it is no longer the run for this key.
      .then((result) => settleRun(key, run, result.status === 'aborted' ? null : result))
      .catch((err: unknown) =>
        settleRun(key, run, refusedResult(err instanceof Error ? err.message : String(err))),
      )
  }

  if (!isStepModule) {
    const noticeDescription = path
      ? `${path} is not a step module. Open a file under nodes/ to run its body against inputs you make up.`
      : 'Open a step module under nodes/ to run its body against inputs you make up.'
    return <PanelNotice title="Quick test runs one step" description={noticeDescription} />
  }

  const inputsHint = shape?.inputNames.length === 0 ? 'This step reads nothing from inputs' : ''

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 md:grid-cols-2">
      <div className="flex min-h-0 flex-col gap-2 overflow-auto">
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={view.running || refusal !== null} onClick={handleRun}>
            {view.running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {view.running ? 'Running…' : 'Run step'}
          </Button>
          {refusal === null && (
            <span className="text-[11px] text-muted-foreground/70">
              In the browser — nothing is deployed.
            </span>
          )}
        </div>

        {refusal !== null ? (
          <p className="rounded-md border border-status-warning/40 bg-status-warning/5 p-2 text-xs text-status-warning">
            {refusal}
          </p>
        ) : (
          <>
            <ArgField
              field="inputs"
              label="inputs"
              hint={inputsHint}
              value={fields.inputs}
              invalid={invalidField === 'inputs'}
              storeKey={key}
              onChange={handleFieldChange}
            />
            <ArgField
              field="env"
              label="env"
              hint="Secrets and project variables start blank"
              value={fields.env}
              invalid={invalidField === 'env'}
              storeKey={key}
              onChange={handleFieldChange}
            />
            <ArgField
              field="event"
              label="event"
              hint=""
              value={fields.event}
              invalid={invalidField === 'event'}
              storeKey={key}
              onChange={handleFieldChange}
            />
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-col overflow-auto rounded-md border border-border bg-card">
        <ResultView result={view.result} running={view.running} />
      </div>
    </div>
  )
}

function ArgField({
  field,
  label,
  hint,
  value,
  invalid,
  storeKey,
  onChange,
}: {
  field: QuickTestField
  label: string
  hint: string
  value: string
  invalid: boolean
  storeKey: string | null
  onChange: (key: string, field: QuickTestField, text: string) => void
}) {
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (storeKey) onChange(storeKey, field, e.target.value)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`quick-test-${field}`} className="font-mono text-[11px] text-foreground/80">
          {label}
        </label>
        <span className="text-[10px] text-muted-foreground/60">
          {invalid ? 'Not valid JSON' : hint}
        </span>
      </div>
      <textarea
        id={`quick-test-${field}`}
        value={value}
        onChange={handleChange}
        spellCheck={false}
        rows={3}
        className={cn(
          'resize-y rounded-md border border-input bg-editor p-2 font-mono text-xs',
          invalid && 'border-destructive',
        )}
      />
    </div>
  )
}

// `aborted` is never stored — settleRun drops it — but the map is total so
// an unexpected status can never render as a blank header.
const STATUS_STYLES: Record<QuickTestResult['status'], string> = {
  ok: 'text-status-success',
  error: 'text-status-error',
  timeout: 'text-status-warning',
  refused: 'text-status-warning',
  aborted: 'text-muted-foreground',
}

const STATUS_LABELS: Record<QuickTestResult['status'], string> = {
  ok: 'Returned',
  error: 'Threw',
  timeout: 'Timed out',
  // Not "Threw": the step never ran, so saying it threw blames code that
  // was never reached.
  refused: 'Didn’t run',
  aborted: 'Stopped',
}

function ResultView({ result, running }: { result: QuickTestResult | null; running: boolean }) {
  if (running && !result) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Running in a Web Worker. It is stopped automatically if it does not finish.
      </p>
    )
  }
  if (!result) {
    return (
      <p className="p-3 text-xs text-muted-foreground/70">
        The return value, anything logged, and any error land here.
      </p>
    )
  }

  const label = STATUS_LABELS[result.status]

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border px-2 py-1.5">
        <span className={cn('text-[11px] font-medium', STATUS_STYLES[result.status])}>{label}</span>
        {/* No duration for something that never ran — "0 ms" reads as a
            measurement rather than an absence. */}
        {result.status !== 'refused' && (
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {result.durationMs} ms
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {result.error && (
          // Message only. The worker's stack numbers lines in the generated
          // script — prelude, stub and transpiled output included — so every
          // frame would point somewhere the file on screen does not have.
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-status-error">
            {result.error.message}
          </pre>
        )}
        {result.status === 'ok' && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {result.result || 'undefined'}
          </pre>
        )}
        {result.logs.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/50">
              Console
            </div>
            {result.logs.map((log, index) => (
              <pre
                key={index}
                className={cn(
                  'whitespace-pre-wrap break-words font-mono text-[11px]',
                  log.level === 'error' && 'text-status-error',
                  log.level === 'warn' && 'text-status-warning',
                  log.level === 'info' && 'text-muted-foreground',
                )}
              >
                {log.text}
              </pre>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PanelNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
      <FlaskConical className="mb-1 h-5 w-5 text-muted-foreground/30" />
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="max-w-md break-words text-[11px] text-muted-foreground/60">{description}</p>
    </div>
  )
}
