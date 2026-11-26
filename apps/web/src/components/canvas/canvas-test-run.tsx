import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTestSession } from '../../hooks/use-test-session'
import { useRunAction } from '../../hooks/use-run-action'
import { OWN_KEYS_ATTRIBUTE } from '../../lib/shortcuts/key-context'
import { SAVE_VERSION_FIRST } from '../../lib/ide/run-intent'
import { testRunToggle } from '../../lib/workflows/test-run-toggle'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'
import { RunConfirmDialog } from '../ide/run-confirm-dialog'
import { TestSessionPanel } from '../ide/test-session-panel'
import { Button } from '../ui/button'
import type { TopBarToggle } from '../workflows/unified-top-bar'

const UNSAVED_LINE = 'Your unsaved changes aren’t in this session.'

/** What the canvas shows of a test run: its top-bar button and its panel. */
export interface CanvasTestRunParts {
  toggle: TopBarToggle
  /** The panel under the graph, or null while it is hidden. */
  dock: ReactNode
}

interface CanvasTestRunProps {
  workflowId: string
  /** The workflow's current version, which a session runs; null when nothing is saved. */
  versionId: string | null
  /** The canvas shows an older version than the one sessions run. */
  viewingOlder: boolean
  /** The graph has edits Save would write. */
  isDirty: boolean
  /** Why the viewer cannot start a run (a view-only role), when they cannot. */
  viewOnlyReason?: string | null
  /** Saves the graph as a new version; resolves to whether it was written. */
  onSave: () => Promise<boolean>
  children: (parts: CanvasTestRunParts) => ReactNode
}

/**
 * The canvas's test run: the same session and the same panel as in Code,
 * under the graph. It owns the session while the canvas is mounted, so hiding
 * the panel keeps the output.
 */
export function CanvasTestRun({
  workflowId,
  versionId,
  viewingOlder,
  isDirty,
  viewOnlyReason,
  onSave,
  children,
}: CanvasTestRunProps) {
  const open = useCanvasLayoutStore((s) => s.testRunOpen)
  const setOpen = useCanvasLayoutStore((s) => s.setTestRunOpen)
  const session = useTestSession({
    workflowId,
    versionId,
    viewingOlder,
    // The canvas does not hold the stored files' hashes: a save is a new version, which is compared.
    currentHashes: null,
    unsavedCount: isDirty ? 1 : 0,
  })
  const hasVersion = versionId !== null

  function handleStart() {
    setOpen(true)
    void session.start()
  }

  function handleToggle() {
    setOpen(!open)
  }

  function handleClose() {
    setOpen(false)
  }

  async function handleSaveAll() {
    return (await onSave()) ? 1 : 0
  }

  // The same Trigger as in Code: it asks before running a session that is behind what is saved.
  const runAction = useRunAction({
    workflowId,
    hasVersion,
    testSession: session,
    activeFile: null,
    onSaveAll: handleSaveAll,
  })

  const toggle = testRunToggle({
    status: session.session?.status ?? null,
    starting: session.starting,
    open,
    blockedReason: viewOnlyReason ?? (hasVersion ? null : SAVE_VERSION_FIRST),
    onStart: handleStart,
    onToggle: handleToggle,
  })

  const dock = open && hasVersion && !viewOnlyReason && (
    <TestRunDock onClose={handleClose}>
      <TestSessionPanel
        session={session}
        onSaveAll={handleSaveAll}
        onTrigger={runAction.triggerSession}
        unsavedLine={UNSAVED_LINE}
      />
    </TestRunDock>
  )

  return (
    <>
      {children({ toggle, dock: dock || null })}
      <RunConfirmDialog confirm={runAction.confirm} />
    </>
  )
}

/** The parts for a workflow with no row yet: there is nothing to run, and no session to ask for. */
export function unsavedTestRun(): CanvasTestRunParts {
  return {
    toggle: testRunToggle({
      status: null,
      starting: false,
      open: false,
      blockedReason: SAVE_VERSION_FIRST,
      onStart: () => {},
      onToggle: () => {},
    }),
    dock: null,
  }
}

function TestRunDock({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    // The canvas's own keys (delete, undo) must not act on what is typed here.
    event.stopPropagation()
    if (event.key === 'Escape') onClose()
  }

  return (
    <section
      aria-label="Test run"
      onKeyDown={handleKeyDown}
      {...{ [OWN_KEYS_ATTRIBUTE]: '' }}
      className="flex h-[42vh] min-h-64 shrink-0 flex-col border-t border-border bg-card"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium">Test run</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title="Hide panel"
          aria-label="Hide panel"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  )
}
