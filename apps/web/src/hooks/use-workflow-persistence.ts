import { useCallback, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actionToast, failureLine } from '../lib/action-toast'
import { useWorkflowStore } from '../stores/workflow-store'
import { onlyBlockedByEmptyGraph, validateWorkflowForPublish } from '../lib/validate-workflow'
import { buildIRFromState } from '../lib/build-ir'
import { VersionConflictError, type WorkflowSummary } from '../lib/api-client'
import type { NodeRegistry } from '@awaitstep/ir'
import { useItemSlugs } from '../contexts/editor-scope-context'
import { workflowLinks } from '../lib/workflows/detail-links'
import { useGoTo } from '../components/navigation/router-shell-link'
import { useApi } from '../contexts/api-client-context'

export type AutoSaveOutcome = 'saved' | 'skipped' | 'failed' | 'conflict'

/**
 * What the canvas says when Code saved this workflow under it. Said once
 * when the refusal arrives, and again only for an action the person takes
 * that would need a save; the status indicator carries Reload.
 */
export const SAVE_CONFLICT_MESSAGE = 'Workflow changed in Code. Reload to continue.'

/**
 * The save the server refused: which workflow, the base it was built on and
 * what the server holds instead. The conflict lasts while the canvas still
 * shows that base — a refetch that brings the newer version (Reload, the
 * variables dialog, a bindings change) re-hydrates the store and ends it —
 * and never shows for another workflow, should the editor ever move between
 * two without remounting.
 */
interface RefusedSave {
  workflowId: string
  base: string
  currentVersionId: string | null
  currentGraphHash: string | null
}

function stillRefused(
  refused: RefusedSave | null,
  workflowId: string,
  graphHash: string | null,
): boolean {
  return refused !== null && refused.workflowId === workflowId && refused.base === graphHash
}

export function useWorkflowPersistence(opts: {
  workflowId: string
  isNew: boolean
  isDirty: boolean
  /** The workflow has a saved version. Without one, a save of an empty graph stores the settings only. */
  hasVersion?: boolean
  nodeRegistry: NodeRegistry | null | undefined
  /** Only honored on first save (when `isNew`). Defaults to 'workflow'. */
  kind?: 'workflow' | 'script'
}) {
  const api = useApi()
  const { workflowId, isNew, isDirty, hasVersion = true, nodeRegistry, kind } = opts
  const queryClient = useQueryClient()
  const goTo = useGoTo()
  const scope = useItemSlugs()
  const { markClean, setWorkflowId, runValidation } = useWorkflowStore()
  const storeGraphHash = useWorkflowStore((s) => s.graphHash)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  // Code saved this workflow since the canvas loaded it. Nothing drawn here
  // can be saved over that until the canvas shows the newer version: autosave
  // stops, Save and Save-and-switch are withdrawn, Deploy refuses to save
  // first. The ref is the same record for the save paths, which run outside
  // a render and must see the latest refusal, not the one they closed over.
  const [refused, setRefused] = useState<RefusedSave | null>(null)
  const refusedRef = useRef<RefusedSave | null>(null)
  const saveConflict = stillRefused(refused, workflowId, storeGraphHash)
  // The save in flight, if any. Autosave and Save can overlap; the later one
  // waits, so it reads the state and the base the earlier one leaves behind
  // instead of posting the same base twice.
  const inFlight = useRef<Promise<void> | null>(null)

  const isConflicted = useCallback(
    () => stillRefused(refusedRef.current, workflowId, useWorkflowStore.getState().graphHash),
    [workflowId],
  )

  const setRefusal = useCallback((next: RefusedSave | null) => {
    refusedRef.current = next
    setRefused(next)
  }, [])

  const saveOnce = useCallback(async (): Promise<WorkflowSummary | null> => {
    const state = useWorkflowStore.getState()
    const ir = buildIRFromState(state)

    // Trigger code and dependencies are project files (handlers.ts,
    // package.json) edited in the code workspace; the canvas only mirrors
    // them, so it never writes them back.
    const deployConfig = state.deployConfig.route ? state.deployConfig : undefined

    // `isNew` is the route's view of things. A save queued behind the first
    // save of a new workflow finds the created id in the store and saves into
    // it, rather than creating a second workflow.
    const createdId =
      isNew && state.workflowId && state.workflowId !== 'new' ? state.workflowId : null
    if (isNew && !createdId) {
      const created = await api.createWorkflow({
        name: state.metadata.name,
        description: state.metadata.description,
        kind,
      })
      // Known to the store at once, before the success handler re-announces
      // it: a save already waiting must not create another workflow.
      useWorkflowStore.setState({ workflowId: created.id })
      if (deployConfig) await api.updateWorkflow(created.id, { deployConfig })
      const saved = await api.createVersion(created.id, { ir })
      useWorkflowStore.setState({ graphHash: saved.graphHash })
      return created
    }
    const id = createdId ?? workflowId

    // The name and description are edited on the Overview page and the
    // variables in their own dialog; the canvas only mirrors them, so it never
    // writes them back over a newer edit from another tab.
    // Nothing drawn and nothing saved before: there is no graph to make a version of.
    if (!hasVersion && state.nodes.length === 0) {
      if (deployConfig) await api.updateWorkflow(id, { deployConfig })
      return null
    }
    // The base is the version the canvas shows (or the last save's response):
    // the server refuses the write when Code moved the graph meanwhile,
    // rather than letting this graph overwrite it.
    const saved = await api.createVersion(id, {
      ir,
      ...(state.graphHash !== null && { baseGraphHash: state.graphHash }),
    })
    // Before the refetch lands, so a save that follows at once builds on it.
    useWorkflowStore.setState({ graphHash: saved.graphHash })
    // After the version, so a refused save has written nothing at all.
    if (deployConfig) await api.updateWorkflow(id, { deployConfig })
    return null
  }, [api, isNew, hasVersion, kind, workflowId])

  // One toast per refusal: a save refused again for the same base says nothing
  // more. A save that carried no base (a first version) can still be refused —
  // the server lost its write race twice — but there is nothing to hold the
  // canvas against; the callers report that as a failed save to try again.
  const noteConflict = useCallback(
    (err: VersionConflictError) => {
      const base = useWorkflowStore.getState().graphHash
      if (base === null || stillRefused(refusedRef.current, workflowId, base)) return
      setRefusal({
        workflowId,
        base,
        currentVersionId: err.currentVersionId,
        currentGraphHash: err.currentGraphHash,
      })
      actionToast.error(SAVE_CONFLICT_MESSAGE)
    },
    [workflowId, setRefusal],
  )

  const performSave = useCallback(async (): Promise<WorkflowSummary | null> => {
    while (inFlight.current) await inFlight.current
    // The save ahead of this one may have been the refusal: this one would
    // post the same base and be refused the same way, so it is not sent.
    const current = refusedRef.current
    if (current && isConflicted()) {
      throw new VersionConflictError(
        SAVE_CONFLICT_MESSAGE,
        current.currentVersionId,
        current.currentGraphHash,
      )
    }
    const attempt = saveOnce().catch((err: unknown) => {
      // Recorded here, before a save waiting behind this one wakes (it waits
      // on `settled`, which follows this handler), so it finds the refusal
      // and sends nothing; the callers only translate the outcome.
      if (err instanceof VersionConflictError) noteConflict(err)
      throw err
    })
    const settled = attempt.then(
      () => undefined,
      () => undefined,
    )
    inFlight.current = settled
    try {
      return await attempt
    } finally {
      if (inFlight.current === settled) inFlight.current = null
    }
  }, [saveOnce, isConflicted, noteConflict])

  const onSaveSuccess = useCallback(
    (created: WorkflowSummary | null) => {
      markClean()
      setLastSavedAt(new Date())
      setSaveError(null)
      setRefusal(null)
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-summary', workflowId] })
      if (created) {
        window.history.replaceState(null, '', workflowLinks(scope, created.id).editor('canvas'))
        setWorkflowId(created.id)
        if (isNew) {
          queryClient.invalidateQueries({ queryKey: ['workflows'] })
        }
      }
    },
    [markClean, queryClient, workflowId, setWorkflowId, isNew, scope, setRefusal],
  )

  const saveMutation = useMutation({
    // The toolbar's save status keeps the reason too, but only on hover and
    // only from a wide screen, so the toast carries it as well.
    meta: {
      toast: {
        success: 'Workflow saved',
        // A refused base is a state of the canvas (Changed in Code, Reload),
        // announced once by `noteConflict`, not a failed save.
        error: (_variables, err) =>
          err instanceof VersionConflictError ? null : 'Couldn’t save the workflow',
      },
    },
    mutationFn: performSave,
    onSuccess: onSaveSuccess,
    onError: (err) => {
      if (err instanceof VersionConflictError) {
        // Recorded and announced by `performSave` when the canvas had a base.
        if (isConflicted()) return
        // Without one the mutation's toast stayed quiet, so this says it.
        actionToast.error(failureLine(err, 'Couldn’t save the workflow'))
      }
      setSaveError(failureLine(err, 'Failed to save workflow'))
    },
  })

  /**
   * Saves and reports whether it worked, for callers that do something next
   * — switching surface, say. Both failure paths have already told the user
   * why (the validation panel, or the save toast and status), so the
   * boolean is only about whether to carry on.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
    // Nothing the canvas holds can be saved over what Code wrote; the only
    // way on is Reload, which the status indicator offers.
    if (isConflicted()) {
      actionToast.error(SAVE_CONFLICT_MESSAGE)
      return false
    }
    const state = useWorkflowStore.getState()
    const settings = {
      workflowEnvVars: state.workflowEnvVars,
    }
    const result = validateWorkflowForPublish(
      state.metadata,
      state.nodes,
      state.edges,
      undefined,
      settings,
      state.kind,
    )
    // A workflow nobody has drawn on has nothing to save, and that must not
    // stop a switch of surface that asked for a save first: it succeeds, with no version.
    const settingsOnly = !isNew && !hasVersion && onlyBlockedByEmptyGraph(result)
    if (!result.canPublish && !settingsOnly) {
      // The panel lists every issue (click-to-focus) and node badges mark
      // them on the canvas — one toast points there instead of N toasts.
      useWorkflowStore.setState({ validationResult: result, simulationResult: null })
      const errorCount = result.issues.filter((i) => i.severity === 'error').length
      actionToast.error(
        errorCount === 1 ? 'Fix 1 issue before saving' : `Fix ${errorCount} issues before saving`,
      )
      return false
    }
    useWorkflowStore.getState().clearValidation()
    try {
      await saveMutation.mutateAsync()
      return true
    } catch {
      return false
    }
  }, [saveMutation, isNew, hasVersion, isConflicted])

  const handleSave = useCallback(() => {
    void saveNow()
  }, [saveNow])

  const saveSilent = useCallback(async (): Promise<AutoSaveOutcome> => {
    if (isConflicted()) return 'conflict'
    const state = useWorkflowStore.getState()
    const result = validateWorkflowForPublish(
      state.metadata,
      state.nodes,
      state.edges,
      undefined,
      { workflowEnvVars: state.workflowEnvVars },
      state.kind,
    )
    // Skip silently on validation errors — manual Save will surface them.
    if (!result.canPublish) return 'skipped'
    setIsAutoSaving(true)
    try {
      const created = await performSave()
      onSaveSuccess(created)
      return 'saved'
    } catch (err) {
      if (err instanceof VersionConflictError && isConflicted()) return 'conflict'
      setSaveError(failureLine(err, 'Failed to save workflow'))
      return 'failed'
    } finally {
      setIsAutoSaving(false)
    }
  }, [performSave, onSaveSuccess, isConflicted])

  /**
   * Replaces the canvas with the workflow as it is saved now, after Code
   * changed it: the refetched version re-hydrates the store (its unsaved
   * canvas edits go, which the caller has confirmed) and the next save
   * builds on that version's base. False when the refetch failed; the
   * canvas then stays as it was, conflict included, and the query's own
   * error — the canvas reports a failed load — says so, once.
   */
  const reload = useCallback(async (): Promise<boolean> => {
    setReloading(true)
    try {
      await queryClient.refetchQueries(
        { queryKey: ['workflow-full', workflowId], type: 'active' },
        { throwOnError: true },
      )
    } catch {
      return false
    } finally {
      setReloading(false)
    }
    // The project files Code may have written alongside: the step editors'
    // imports follow them.
    void queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] })
    setRefusal(null)
    setSaveError(null)
    return true
  }, [queryClient, workflowId, setRefusal])

  const handleDeploy = useCallback(async () => {
    // runValidation publishes into the store: the panel and node badges
    // carry the detail, so the toast is a single pointer to them.
    const result = runValidation(nodeRegistry ?? undefined)
    if (!result.canPublish) {
      const errorCount = result.issues.filter((i) => i.severity === 'error').length
      actionToast.error(
        errorCount === 1
          ? 'Fix 1 issue before deploying'
          : `Fix ${errorCount} issues before deploying`,
      )
      return
    }
    if (isDirty || isNew) {
      // Deploying would first save this canvas over Code's version.
      if (isConflicted()) {
        actionToast.error(SAVE_CONFLICT_MESSAGE)
        return
      }
      try {
        await saveMutation.mutateAsync()
      } catch {
        // The save already said it failed: one toast, not two.
        return
      }
    }
    const targetId = isNew ? (useWorkflowStore.getState().workflowId ?? workflowId) : workflowId
    goTo(workflowLinks(scope, targetId).deploy)
  }, [
    runValidation,
    isDirty,
    isNew,
    saveMutation,
    isConflicted,
    nodeRegistry,
    goTo,
    scope,
    workflowId,
  ])

  return {
    handleSave,
    saveNow,
    handleDeploy,
    saveSilent,
    isSaving: saveMutation.isPending || isAutoSaving,
    lastSavedAt,
    saveError,
    saveConflict,
    reload,
    reloading,
  }
}
