import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { QuickTestField } from '../lib/ide/quick-test'
import type { QuickTestResult } from '../lib/ide/quick-test-runner'
import { MAX_TRIGGER_PAYLOAD_BYTES } from '../lib/ide/session-log'
import { boundPersistedText } from './bounded-persist'
import {
  isRememberedStateUsable,
  registerRememberedWiper,
  rememberedEnvelope,
  rememberedInputsStorage,
  QUICK_TEST_STORAGE_KEY,
} from './remembered-inputs'

interface QuickTestView {
  /**
   * Null until the field is edited, so the panel can show a seed derived
   * from the file as it stands — the names a body destructures change as it
   * is edited, and a value copied into the store at first sight would go
   * stale the moment the code did.
   */
  inputs: string | null
  env: string | null
  event: string | null
  result: QuickTestResult | null
  running: boolean
  /** The field whose text was refused as not JSON on the last run attempt. */
  invalid: QuickTestField | null
}

/** What survives a reload: the arguments worth retyping, and never `env`. */
export interface RememberedArgs {
  inputs?: string
  event?: string
}

/** How many steps' arguments are remembered; the least recently edited go first. */
export const MAX_REMEMBERED_STEPS = 100

const EMPTY: QuickTestView = {
  inputs: null,
  env: null,
  event: null,
  result: null,
  running: false,
  invalid: null,
}

/**
 * Two workflows can both have `nodes/step_1.ts`, and they are not the same
 * file. Keyed by both so one workflow's arguments and results can never
 * surface in another — including a run still in flight.
 */
export function quickTestKey(workflowId: string, path: string): string {
  // JSON rather than a separator character: a raw delimiter in the source
  // made git treat this file as binary, hiding its diffs entirely.
  return JSON.stringify([workflowId, path])
}

/**
 * Handles for runs in flight, deliberately outside the store's state:
 * nothing renders from them, and they serve two purposes at once. They kill
 * a worker whose workspace has gone away, and they identify which run a
 * result belongs to — a late answer from an abandoned run must not write
 * itself back into a store that has already been cleared.
 */
const inFlight = new Map<string, AbortController>()

interface QuickTestState {
  views: Record<string, QuickTestView>
  /** Persisted inputs and event per workflow and step. `env` is deliberately not here. */
  remembered: Record<string, RememberedArgs>
  /** Which argument tab is showing, shared by every step. */
  argTab: QuickTestField
  setArgTab: (tab: QuickTestField) => void
  /** Drops a field back to its seed (and forgets it). */
  resetField: (key: string, field: QuickTestField) => void
  setInvalid: (key: string, field: QuickTestField | null) => void
  setField: (key: string, field: QuickTestField, text: string) => void
  /** Marks a run started and returns its handle; supersedes any earlier one. */
  beginRun: (key: string) => AbortController
  /** Records a run's outcome, or nothing at all if it is no longer the run. */
  settleRun: (key: string, run: AbortController, result: QuickTestResult | null) => void
  /** Back to nothing, for leaving a workspace. Kills anything still running. */
  reset: () => void
}

/**
 * What a quick test knows per file: the arguments being tried and what came
 * back. Kept here rather than in the panel because the dock unmounts its
 * panels when hidden, and a run in flight would otherwise lose its result
 * the moment someone collapsed the dock to read more code.
 */
export const useQuickTestStore = create<QuickTestState>()(
  persist(
    (set) => ({
      views: {},
      remembered: {},
      argTab: 'inputs',

      setArgTab: (argTab) => set({ argTab }),

      setInvalid: (key, invalid) =>
        set((state) => ({
          views: { ...state.views, [key]: { ...(state.views[key] ?? EMPTY), invalid } },
        })),

      setField: (key, field, text) =>
        set((state) => ({
          views: {
            ...state.views,
            [key]: { ...(state.views[key] ?? EMPTY), [field]: text, invalid: null },
          },
          remembered:
            field === 'env' ? state.remembered : remember(state.remembered, key, field, text),
        })),

      resetField: (key, field) =>
        set((state) => ({
          views: {
            ...state.views,
            [key]: { ...(state.views[key] ?? EMPTY), [field]: null, invalid: null },
          },
          remembered:
            field === 'env' ? state.remembered : remember(state.remembered, key, field, null),
        })),

      beginRun: (key) => {
        inFlight.get(key)?.abort()
        const run = new AbortController()
        inFlight.set(key, run)
        set((state) => ({
          views: {
            ...state.views,
            [key]: { ...(state.views[key] ?? EMPTY), running: true, result: null, invalid: null },
          },
        }))
        return run
      },

      settleRun: (key, run, result) => {
        // Not the current run: it was superseded, or its workspace is gone.
        // Writing anything here would resurrect state that was deliberately
        // cleared, which is how an old result came back on returning to a
        // workflow.
        if (inFlight.get(key) !== run) return
        inFlight.delete(key)
        set((state) => ({
          views: {
            ...state.views,
            [key]: { ...(state.views[key] ?? EMPTY), running: false, ...(result && { result }) },
          },
        }))
      },

      reset: () => {
        for (const run of inFlight.values()) run.abort()
        inFlight.clear()
        // Remembered arguments stay: leaving a workspace is not forgetting them.
        set({ views: {} })
      },
    }),
    {
      name: QUICK_TEST_STORAGE_KEY,
      storage: createJSONStorage(() => rememberedInputsStorage()),
      partialize: (state) => ({
        ...rememberedEnvelope(),
        remembered: boundPersistedText(
          state.remembered,
          (args) => (args.inputs?.length ?? 0) + (args.event?.length ?? 0),
          MAX_TRIGGER_PAYLOAD_BYTES,
        ),
      }),
      // Stored arguments that are another person's, too old or from before
      // owners were recorded are not loaded.
      merge: (persisted, current) =>
        isRememberedStateUsable(persisted)
          ? { ...current, ...(persisted as Partial<QuickTestState>) }
          : current,
    },
  ),
)

registerRememberedWiper(() => {
  for (const run of inFlight.values()) run.abort()
  inFlight.clear()
  useQuickTestStore.setState({ remembered: {}, views: {} })
})

/** `remembered` with one field set (or, for null, removed); the touched step moves to the newest slot. */
function remember(
  remembered: Record<string, RememberedArgs>,
  key: string,
  field: 'inputs' | 'event',
  text: string | null,
): Record<string, RememberedArgs> {
  const { [key]: previous, ...others } = remembered
  const next: RememberedArgs = { ...previous }
  if (text === null) delete next[field]
  else next[field] = text
  if (Object.keys(next).length === 0) return others
  return Object.fromEntries(Object.entries({ ...others, [key]: next }).slice(-MAX_REMEMBERED_STEPS))
}

/** The view for a file, or an empty one — never undefined at a call site. */
export function quickTestView(
  views: Record<string, QuickTestView>,
  key: string | null,
): QuickTestView {
  return (key ? views[key] : undefined) ?? EMPTY
}
