import { useState } from 'react'
import { Activity } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import type { TestSessionState } from '../../hooks/use-test-session'
import { useElementWidth } from '../../hooks/use-element-width'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { InstancePane } from './instance-pane'
import { describeSavedChanges, describeUnsaved } from '../../lib/ide/session-staleness'
import { useTestSessionStore, sessionView } from '../../stores/test-session-store'
import { OutputPanel } from './output-panel'
import { SessionHeader } from './session-header'
import { StalenessLine } from './session-bars'
import { TriggerPayload } from './trigger-payload'

/**
 * One tab for a test session: start it, trigger it, read what it printed.
 * Output used to be a tab of its own, which made following one run mean
 * flipping between two.
 */
export function TestSessionPanel({
  session: state,
  onSaveAll,
  onTrigger,
  unsavedLine: unsavedWords,
  kind = 'workflow',
}: {
  session: TestSessionState
  onSaveAll: () => Promise<number>
  /** Triggers with the current payload; asks first when the session is behind. */
  onTrigger: () => void
  /** How unsaved work is named where it is not files (the canvas's graph). */
  unsavedLine?: string
  /** A script has no instances, so no Instance pane. */
  kind?: 'workflow' | 'script'
}) {
  const { session, stale, actionError, logs, restart } = state
  const clearedBefore = useTestSessionStore(
    (s) => sessionView(s.views, session?.id ?? null).clearedBefore,
  )
  // Said only of a running session: a stopped one is not "behind" anything.
  const running = session?.status === 'running'
  const savedLine = session && running ? describeSavedChanges(stale, session.createdAt) : null
  const versionLine =
    running && stale.version && !savedLine
      ? 'Changes were saved after this session started. Restart to run them.'
      : null
  const unsavedLine = running && stale.unsaved > 0 ? (unsavedWords ?? describeUnsaved(stale)) : null

  const notices = Boolean(savedLine || versionLine || unsavedLine || actionError)

  function handleRestart() {
    void restart()
  }

  // Saving first is the point: if any file failed to save (a conflict, a
  // limit) it has said why, and restarting without it would test other code
  // than the person asked for.
  function handleSaveAndRestart() {
    const pending = stale.unsaved
    void onSaveAll().then((saved) => {
      if (saved >= pending) void restart()
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionHeader state={state} />
      {notices && (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2">
          {savedLine && (
            <StalenessLine text={savedLine} action="Restart" onAction={handleRestart} />
          )}
          {versionLine && (
            <StalenessLine text={versionLine} action="Restart" onAction={handleRestart} />
          )}
          {unsavedLine && (
            <StalenessLine
              text={unsavedLine}
              action="Save and restart"
              onAction={handleSaveAndRestart}
            />
          )}
          {actionError && (
            <p role="alert" className="text-2xs text-destructive">
              {actionError}
            </p>
          )}
        </div>
      )}
      {kind === 'workflow' && session ? (
        <WorkflowPanes state={state} onTrigger={onTrigger} clearedBefore={clearedBefore} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:divide-x md:divide-y-0">
          <TriggerPayload state={state} onTrigger={onTrigger} />
          <OutputPanel sessionId={session?.id ?? null} lines={logs} clearedBefore={clearedBefore} />
        </div>
      )}
    </div>
  )
}

/** Below this width the three panes don't fit; Instance opens over Output from its header. */
export const INSTANCE_PANE_MIN_DOCK_PX = 900
const LAYOUT_KEY = 'testSession'
const SEPARATOR = 'w-px bg-border transition-colors hover:bg-primary/50'

/** Trigger | Output | Instance, resizable, the sizes kept per browser. */
function WorkflowPanes({
  state,
  onTrigger,
  clearedBefore,
}: {
  state: TestSessionState
  onTrigger: () => void
  clearedBefore: number
}) {
  const session = state.session!
  const [measure, width] = useElementWidth()
  const [initialLayout] = useState(() => useIdeLayoutStore.getState().layouts[LAYOUT_KEY])
  const setLayout = useIdeLayoutStore((s) => s.setLayout)
  const [instanceOpen, setInstanceOpen] = useState(false)
  const narrow = width !== null && width < INSTANCE_PANE_MIN_DOCK_PX

  function handleLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    if (meta.isUserInteraction) setLayout(LAYOUT_KEY, meta.requestedLayout ?? layout)
  }

  function handleOpenInstance() {
    setInstanceOpen(true)
  }

  function handleCloseInstance() {
    setInstanceOpen(false)
  }

  const output = (
    <OutputPanel
      sessionId={session.id}
      lines={state.logs}
      clearedBefore={clearedBefore}
      headerAction={
        narrow && (
          <button
            type="button"
            onClick={handleOpenInstance}
            className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-border px-2 text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Activity className="h-3 w-3" />
            Instance
          </button>
        )
      }
    />
  )

  return (
    <div ref={measure} className="min-h-0 flex-1">
      {narrow ? (
        <div className="grid h-full min-h-0 grid-cols-1 divide-y divide-border md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:divide-x md:divide-y-0">
          <TriggerPayload state={state} onTrigger={onTrigger} />
          {instanceOpen ? <InstancePane session={session} onClose={handleCloseInstance} /> : output}
        </div>
      ) : (
        <Group
          orientation="horizontal"
          className="h-full"
          defaultLayout={initialLayout}
          onLayoutChanged={handleLayoutChanged}
        >
          <Panel id="trigger" defaultSize="25" minSize={180}>
            <TriggerPayload state={state} onTrigger={onTrigger} />
          </Panel>
          <Separator className={SEPARATOR} />
          <Panel id="output" defaultSize="40" minSize={240}>
            {output}
          </Panel>
          <Separator className={SEPARATOR} />
          <Panel id="instance" defaultSize="35" minSize={280}>
            <InstancePane session={session} />
          </Panel>
        </Group>
      )}
    </div>
  )
}
