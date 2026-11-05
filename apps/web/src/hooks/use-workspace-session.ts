import { useMemo, useRef } from 'react'
import type { IdeCommandActions } from '../lib/ide/commands'
import { sessionCommands } from '../lib/ide/run-intent'
import { sessionStatus } from '../lib/ide/status-bar'
import { useIdeLayoutStore } from '../stores/ide-layout-store'
import { useIdeStore } from '../stores/ide-store'
import { useRunAction } from './use-run-action'
import { useTestSession } from './use-test-session'

interface UseWorkspaceSessionOptions {
  workflowId: string
  /** The workflow's current version: the one a session runs, whatever the editor shows. */
  currentVersionId: string | null
  /** The editor shows an older version than the current one. */
  historical: boolean
  /** `{ path: hash }` of the stored project files shown now. */
  storedHashes: Readonly<Record<string, string>>
  /** The open file with unsaved edits applied. */
  activeFile: { path: string; source: string } | null
  /** Saves every unsaved file; resolves to how many were written. */
  onSaveAll: () => Promise<number>
}

type SessionActions = Pick<
  IdeCommandActions,
  'run' | 'startSession' | 'stopSession' | 'triggerSession'
>

/**
 * Everything the workspace shows and does about the test session, in one
 * place: the session, Run, the status bar's line and which palette commands
 * can do something. Owned by the workspace so it outlives the dock being hidden.
 */
export function useWorkspaceSession({
  workflowId,
  currentVersionId,
  historical,
  storedHashes,
  activeFile,
  onSaveAll,
}: UseWorkspaceSessionOptions) {
  const unsavedCount = useIdeStore((s) => Object.keys(s.drafts).length)
  const testSession = useTestSession({
    workflowId,
    versionId: currentVersionId,
    viewingOlder: historical,
    // An older version's hashes are a snapshot's, not the live project's.
    currentHashes: historical ? null : storedHashes,
    unsavedCount,
  })
  const runAction = useRunAction({ workflowId, testSession, activeFile, onSaveAll })

  const pending = {
    starting: testSession.starting,
    stopping: testSession.stopping,
    triggering: testSession.triggering,
  }
  const status = sessionStatus(testSession.session, testSession.stale, pending)
  const commands = sessionCommands(testSession.session, pending)

  // Handlers behind a ref so the actions keep one identity: the command list
  // and the palette are memoised on them and would otherwise rebuild on every render.
  const latest = useRef({ testSession, runAction })
  latest.current = { testSession, runAction }
  const actions = useMemo<SessionActions>(
    () => ({
      run: () => latest.current.runAction.run(),
      startSession: () => {
        useIdeLayoutStore.getState().showDock('session')
        void latest.current.testSession.start()
      },
      stopSession: () => void latest.current.testSession.stop(),
      triggerSession: () => latest.current.runAction.triggerSession(),
    }),
    [],
  )

  return { testSession, runAction, status, commands, actions }
}
