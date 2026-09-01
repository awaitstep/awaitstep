import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../stores/workflow-store'
import type { AutoSaveOutcome } from './use-workflow-persistence'

interface UseAutoSaveOpts {
  enabled: boolean
  delayMs?: number
  save: () => Promise<AutoSaveOutcome>
}

/**
 * Debounced auto-save: schedules `save()` `delayMs` after the last meaningful
 * change to the workflow store, and resets the timer on each subsequent change
 * while still dirty. The watched slice excludes selection state so simply
 * clicking a node does not push back the save.
 *
 * Cancels the timer when the workflow becomes clean (e.g. after a manual save)
 * or when `enabled` flips to false (read-only / new workflows).
 */
export function useAutoSave({ enabled, delayMs = 30_000, save }: UseAutoSaveOpts) {
  const saveRef = useRef(save)
  saveRef.current = save

  const watched = useWorkflowStore(
    useShallow((s) => ({
      isDirty: s.isDirty,
      nodes: s.nodes,
      edges: s.edges,
      metadata: s.metadata,
      workflowEnvVars: s.workflowEnvVars,
      dependencies: s.dependencies,
      triggerCode: s.triggerCode,
      deployConfig: s.deployConfig,
    })),
  )

  useEffect(() => {
    if (!enabled || !watched.isDirty) return
    const timer = setTimeout(() => {
      void saveRef.current()
    }, delayMs)
    return () => clearTimeout(timer)
  }, [enabled, delayMs, watched])
}
