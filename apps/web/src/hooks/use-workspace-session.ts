import { useMemo, useRef } from 'react'
import type { IdeCommandActions } from '../lib/ide/commands'
import { SAVE_VERSION_FIRST, sessionCommands } from '../lib/ide/run-intent'
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
  const hasVersion = currentVersionId !== null
  const runAction = useRunAction({ workflowId, hasVersion, testSession, activeFile, onSaveAll })

  const pending = {
    starting: testSession.starting,
    stopping: testSession.stopping,
    triggering: testSession.triggering,
  }
  const status = sessionStatus(testSession.session, testSession.stale, pending)
  const commands = sessionCommands(testSession.session, pending, hasVersion)
  // Why Run and the session commands are off, or null when they can work.
  const blockedReason = hasVersion ? null : SAVE_VERSION_FIRST

  // Handlers behind a ref so the actions keep one identity: the command list
  // and the palette are memoised on them and would otherwise rebuild on every render.
  const latest = useRef({ testSession, runAction, hasVersion })
  latest.current = { testSession, runAction, hasVersion }
  const actions = useMemo<SessionActions>(
    () => ({
      run: () => latest.current.runAction.run(),
      startSession: () => {
        useIdeLayoutStore.getState().showDock('session')
        // Without a version the dock shows why; there is nothing to start.
        if (!latest.current.hasVersion) return
        void latest.current.testSession.start()
      },
      stopSession: () => void latest.current.testSession.stop(),
      triggerSession: () => latest.current.runAction.triggerSession(),
    }),
    [],
  )

  return { testSession, runAction, status, commands, blockedReason, hasVersion, actions }
}
