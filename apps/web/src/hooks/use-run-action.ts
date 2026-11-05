import { useState } from 'react'
import { actionToast } from '../lib/action-toast'
import { runStepQuickTest, isRunnableStep } from '../lib/ide/quick-test-run'
import { runIntent, type RunIntent } from '../lib/ide/run-intent'
import { parseTriggerPayload } from '../lib/ide/session-log'
import {
  askDescription,
  describeSavedChanges,
  isBehind,
  savedChangeCount,
} from '../lib/ide/session-staleness'
import { useIdeLayoutStore } from '../stores/ide-layout-store'
import { useIdeStore } from '../stores/ide-store'
import type { TestSessionState } from './use-test-session'

interface UseRunActionOptions {
  workflowId: string
  testSession: TestSessionState
  /** The open file with unsaved edits applied. */
  activeFile: { path: string; source: string } | null
  /** Saves every unsaved file; resolves to how many were written. */
  onSaveAll: () => Promise<number>
}

/** The question Run or Trigger asks before going ahead. */
export interface RunConfirm {
  open: boolean
  title: string
  description: string
  /** Does the careful thing: save, restart, run. */
  confirmLabel: string
  /** Goes ahead with the session as it is. */
  secondaryLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onSecondary: () => void
}

export interface RunAction {
  intent: RunIntent
  /** What ⌥⏎ and the toolbar button do. */
  run: () => void
  /** Triggers the running session with the current payload (Trigger button, palette). */
  triggerSession: () => void
  confirm: RunConfirm
}

type Question =
  /** Run would use a session that cannot hold the unsaved files. */
  | { reason: 'unsaved'; value: unknown; kind: RunIntent['kind'] }
  /** Trigger would test code older than what is saved. */
  | { reason: 'behind'; value: unknown }

const CLOSED: RunConfirm = {
  open: false,
  title: '',
  description: '',
  confirmLabel: '',
  secondaryLabel: '',
  onOpenChange: () => {},
  onConfirm: () => {},
  onSecondary: () => {},
}

/**
 * The one Run: a step file is quick-tested, anything else goes through the
 * test session. The panel it needs opens without taking focus, and focus is
 * handed back to the editor whichever way it was pressed.
 *
 * Every path to a trigger ends here, so the same two questions are asked
 * wherever it was pressed — Run, the Trigger button and the palette.
 */
export function useRunAction({
  workflowId,
  testSession,
  activeFile,
  onSaveAll,
}: UseRunActionOptions): RunAction {
  const [question, setQuestion] = useState<Question | null>(null)
  const { session, stale, acceptedSignature } = testSession
  const unsaved = stale.unsaved
  const behind = isBehind(stale) && stale.signature !== acceptedSignature

  const intent = runIntent({
    isStep: activeFile !== null && isRunnableStep(activeFile.path, activeFile.source),
    session,
    starting: testSession.starting,
    stopping: testSession.stopping,
    triggering: testSession.triggering,
    behind,
    unsavedCount: unsaved,
  })

  function focusEditor() {
    useIdeStore.getState().editorHandle?.focus()
  }

  function showTab(tab: 'session' | 'quickTest') {
    useIdeLayoutStore.getState().showDock(tab)
  }

  /** The payload as a value, or false after saying why it can't be sent. */
  function readPayload(): { value: unknown } | false {
    const parsed = parseTriggerPayload(testSession.payload)
    if (!parsed.ok) {
      testSession.setPayloadError(parsed.error)
      showTab('session')
      return false
    }
    testSession.setPayloadError(null)
    return { value: parsed.value }
  }

  function execute(kind: RunIntent['kind'], value: unknown) {
    showTab('session')
    if (kind === 'trigger') void testSession.trigger(value)
    else if (kind === 'restartAndTrigger' || kind === 'startAndTrigger') {
      void testSession.restartAndTrigger(value)
    }
  }

  function explainBusy() {
    const messages: Record<string, string> = {
      'Stopping…': 'The test session is stopping.',
      'Running…': 'The last trigger is still running.',
    }
    actionToast.info(
      messages[intent.label] ?? 'The test session is still starting. Run it again when it’s ready.',
    )
  }

  function run() {
    try {
      if (intent.kind === 'busy') {
        explainBusy()
        return
      }
      if (intent.kind === 'quickTest') {
        showTab('quickTest')
        if (activeFile) runStepQuickTest(workflowId, activeFile)
        return
      }
      const payload = readPayload()
      if (!payload) return
      if (intent.needsSave) {
        // Asked once: a session only runs saved files.
        setQuestion({ reason: 'unsaved', value: payload.value, kind: intent.kind })
        return
      }
      execute(intent.kind, payload.value)
    } finally {
      focusEditor()
    }
  }

  function triggerSession() {
    if (session?.status !== 'running' || testSession.triggering) return
    const payload = readPayload()
    if (payload) {
      if (behind) setQuestion({ reason: 'behind', value: payload.value })
      else execute('trigger', payload.value)
    }
    focusEditor()
  }

  function handleOpenChange(open: boolean) {
    if (!open) setQuestion(null)
  }

  /** Saves every unsaved file, then goes on only if all of them were written. */
  function saveThen(next: () => void) {
    const count = unsaved
    if (count === 0) {
      next()
      return
    }
    void onSaveAll().then((saved) => {
      if (saved >= count) next()
    })
  }

  // Saving first is the point: a file that failed to save has said why, and
  // going on without it would test other code than the person asked for.
  function handleConfirm() {
    if (!question) return
    const { value } = question
    const kind = question.reason === 'unsaved' ? question.kind : 'restartAndTrigger'
    setQuestion(null)
    // Saving changes what a running session holds, so it restarts.
    saveThen(() => execute(kind === 'trigger' ? 'restartAndTrigger' : kind, value))
  }

  function handleSecondary() {
    if (!question) return
    const { value } = question
    setQuestion(null)
    if (question.reason === 'behind') {
      testSession.acceptStale(stale.signature)
      execute('trigger', value)
    } else {
      execute(question.kind, value)
    }
  }

  return { intent, run, triggerSession, confirm: describe() }

  function describe(): RunConfirm {
    if (!question) return CLOSED
    const files = unsaved === 1 ? '1 unsaved file' : `${unsaved} unsaved files`
    const common = {
      open: true,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
      onSecondary: handleSecondary,
    }
    if (question.reason === 'behind') {
      return {
        ...common,
        title: 'This session is running older code',
        description: askDescription(
          session ? describeSavedChanges(stale, session.createdAt) : null,
          savedChangeCount(stale),
          stale.version,
          unsaved,
        ),
        confirmLabel: unsaved > 0 ? 'Save, restart and trigger' : 'Restart and trigger',
        secondaryLabel: 'Trigger anyway',
      }
    }
    const running = question.kind === 'trigger'
    return {
      ...common,
      title: 'Save before running?',
      description: running
        ? `The running session doesn’t have your ${files}.`
        : `A test session runs saved files, and you have ${files}.`,
      confirmLabel: running ? 'Save, restart and run' : 'Save and run',
      secondaryLabel: 'Run saved files',
    }
  }
}
