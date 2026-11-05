import { useMemo } from 'react'
import { FlaskConical, Loader2, Play, RotateCcw } from 'lucide-react'
import { parseStepModule, quickTestRefusal, stepModuleVarName } from '../../lib/ide/quick-test'
import { quickTestFields, runStepQuickTest } from '../../lib/ide/quick-test-run'
import { QUICK_TEST_TIMEOUT_MS } from '../../lib/ide/quick-test-runner'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { quickTestKey, quickTestView, useQuickTestStore } from '../../stores/quick-test-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { QuickTestField } from '../../lib/ide/quick-test'
import { Button } from '../ui/button'
import { dockTabId } from './dock-tabs'
import { QuickTestArgs } from './quick-test-args'
import { QuickTestResultView } from './quick-test-result'

interface QuickTestPanelProps {
  workflowId: string
  /** The file in the editor, with any unsaved edits already applied. */
  activeFile: { path: string; source: string } | null
}

/**
 * Runs the open step module on its own, against made-up inputs.
 *
 * Deliberately about the file in the editor rather than the workflow: the
 * Test session tab next door starts a real worker for the whole graph, and
 * the gap this fills is the one between changing three lines of a transform
 * and wanting to know whether they work.
 */
export function QuickTestPanel({ workflowId, activeFile }: QuickTestPanelProps) {
  const path = activeFile?.path ?? null
  const source = activeFile?.source ?? ''
  const key = path === null ? null : quickTestKey(workflowId, path)
  // Only this file's slice: the store holds every file's state, and
  // subscribing to all of it re-rendered the panel on any keystroke
  // anywhere. Actions are read through getState — they never change.
  const view = useQuickTestStore((s) => quickTestView(s.views, key))
  const remembered = useQuickTestStore((s) => (key ? s.remembered[key] : undefined))
  const argTab = useQuickTestStore((s) => s.argTab)
  const envVars = useWorkflowStore((s) => s.workflowEnvVars)
  const runHint = formatShortcut(IDE_SHORTCUTS.run, isMacPlatform())

  const isStepModule = path !== null && stepModuleVarName(path) !== null
  const shape = useMemo(
    () => (isStepModule ? parseStepModule(source) : null),
    [isStepModule, source],
  )
  const refusal = shape ? quickTestRefusal(shape) : null
  const texts = useMemo(
    () => quickTestFields(view, remembered, shape?.inputNames ?? [], envVars),
    [view, remembered, shape, envVars],
  )

  function handleFieldChange(field: QuickTestField, text: string) {
    if (key) useQuickTestStore.getState().setField(key, field, text)
  }

  function handleSelectTab(field: QuickTestField) {
    useQuickTestStore.getState().setArgTab(field)
  }

  function handleRun() {
    if (activeFile) runStepQuickTest(workflowId, activeFile)
  }

  function handleResetInputs() {
    if (key) useQuickTestStore.getState().resetField(key, 'inputs')
    useQuickTestStore.getState().setArgTab('inputs')
  }

  function handleUseSession() {
    useIdeLayoutStore.getState().showDock('session')
    // This button leaves with the panel; the tab stays, so focus goes there
    // instead of falling back to the page.
    document.getElementById(dockTabId('session'))?.focus()
  }

  if (!isStepModule) {
    const noticeDescription = path
      ? `${path} is not a step module. Open a file under nodes/ to run its body against inputs you make up.`
      : 'Open a step module under nodes/ to run its body against inputs you make up.'
    return (
      <PanelNotice title="Quick test runs one step" description={noticeDescription}>
        <Button size="sm" onClick={handleUseSession}>
          Use the test session instead
        </Button>
      </PanelNotice>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
        <Button size="sm" disabled={view.running || refusal !== null} onClick={handleRun}>
          {view.running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {view.running ? 'Running…' : 'Run step'}
          {!view.running && <kbd className="ml-1 font-sans text-[10px]">{runHint}</kbd>}
        </Button>
        <Button size="sm" variant="ghost" disabled={refusal !== null} onClick={handleResetInputs}>
          <RotateCcw className="h-3 w-3" />
          Reset inputs
        </Button>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          Runs this step in your browser · imports not resolved · {QUICK_TEST_TIMEOUT_MS / 1000} s
          limit
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          {refusal !== null ? (
            <p className="rounded-md border border-status-warning/40 bg-status-warning/5 p-2 text-xs text-status-warning">
              {refusal}
            </p>
          ) : (
            <>
              <QuickTestArgs
                active={argTab}
                texts={texts}
                invalid={view.invalid}
                noInputs={shape?.inputNames.length === 0}
                onSelect={handleSelectTab}
                onChange={handleFieldChange}
              />
              <p className="text-[11px] text-muted-foreground">
                Uses what’s in the editor, saved or not.
              </p>
            </>
          )}
        </div>
        <div className="flex min-h-0 flex-col overflow-auto rounded-md border border-border bg-card">
          <QuickTestResultView result={view.result} running={view.running} />
        </div>
      </div>
    </div>
  )
}

function PanelNotice({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
      <FlaskConical className="mb-1 h-5 w-5 text-muted-foreground/30" />
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="max-w-md break-words text-[11px] text-muted-foreground">{description}</p>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  )
}
