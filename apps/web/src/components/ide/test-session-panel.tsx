import type { TestSessionState } from '../../hooks/use-test-session'
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
}: {
  session: TestSessionState
  onSaveAll: () => Promise<number>
  /** Triggers with the current payload; asks first when the session is behind. */
  onTrigger: () => void
  /** How unsaved work is named where it is not files (the canvas's graph). */
  unsavedLine?: string
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
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:divide-x md:divide-y-0">
        <TriggerPayload state={state} onTrigger={onTrigger} />
        <OutputPanel sessionId={session?.id ?? null} lines={logs} clearedBefore={clearedBefore} />
      </div>
    </div>
  )
}
