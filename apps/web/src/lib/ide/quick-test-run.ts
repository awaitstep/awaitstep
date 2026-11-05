import { useQuickTestStore, quickTestKey, quickTestView } from '../../stores/quick-test-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import {
  parseQuickTestArgs,
  parseStepModule,
  quickTestRefusal,
  seedEnv,
  seedInputs,
  stepModuleVarName,
  type QuickTestField,
} from './quick-test'
import { refusedResult, runQuickTest } from './quick-test-runner'

type FieldTexts = Record<QuickTestField, string>

interface WorkflowEnvVar {
  name: string
  value: string
}

/**
 * The text of each argument tab: what was typed (or remembered), else a seed
 * derived from the file as it stands — the names a body destructures change
 * while it is edited, so a seed is never copied into the store.
 */
export function quickTestFields(
  stored: { inputs: string | null; env: string | null; event: string | null },
  remembered: { inputs?: string; event?: string } | undefined,
  inputNames: readonly string[],
  envVars: readonly WorkflowEnvVar[],
): FieldTexts {
  return {
    inputs: stored.inputs ?? remembered?.inputs ?? JSON.stringify(seedInputs(inputNames), null, 2),
    env: stored.env ?? JSON.stringify(seedEnv(envVars), null, 2),
    event: stored.event ?? remembered?.event ?? JSON.stringify({ payload: {} }, null, 2),
  }
}

/** Whether Quick test can run this file: a step module with a default export. */
export function isRunnableStep(path: string, source: string): boolean {
  return stepModuleVarName(path) !== null && quickTestRefusal(parseStepModule(source)) === null
}

/**
 * Runs the step in the open file against its current arguments. Used by the
 * panel's button and by Run, so both read the same stored arguments. Returns
 * false when it did not start: not a runnable step, or an argument that is
 * not JSON (marked on the store so the panel can say which).
 */
export function runStepQuickTest(
  workflowId: string,
  file: { path: string; source: string },
): boolean {
  if (!isRunnableStep(file.path, file.source)) return false
  const key = quickTestKey(workflowId, file.path)
  const state = useQuickTestStore.getState()
  const shape = parseStepModule(file.source)
  const fields = quickTestFields(
    quickTestView(state.views, key),
    state.remembered[key],
    shape.inputNames,
    useWorkflowStore.getState().workflowEnvVars,
  )
  const parsed = parseQuickTestArgs(fields)
  if (!parsed.ok) {
    state.setInvalid(key, parsed.field)
    state.setArgTab(parsed.field)
    return false
  }
  const { beginRun, settleRun } = state
  const run = beginRun(key)
  void runQuickTest({ path: file.path, source: file.source, args: parsed.args, signal: run.signal })
    // An aborted run has no outcome worth showing; settleRun drops it
    // either way, since it is no longer the run for this key.
    .then((result) => settleRun(key, run, result.status === 'aborted' ? null : result))
    .catch((err: unknown) =>
      settleRun(key, run, refusedResult(err instanceof Error ? err.message : String(err))),
    )
  return true
}
