import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { actionToast, failureLine } from '../lib/action-toast'
import { useWorkflowStore } from '../stores/workflow-store'
import { onlyBlockedByEmptyGraph, validateWorkflowForPublish } from '../lib/validate-workflow'
import { buildIRFromState } from '../lib/build-ir'
import { splitSecretName } from '../lib/env-var-parser'
import { api, type WorkflowSummary } from '../lib/api-client'
import type { NodeRegistry } from '@awaitstep/ir'
import { useEditorScope } from '../contexts/editor-scope-context'
import { workflowLinks } from '../lib/workflows/detail-links'
import { useGoTo } from '../components/navigation/router-shell-link'

export type AutoSaveOutcome = 'saved' | 'skipped' | 'failed'

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
  const { workflowId, isNew, isDirty, hasVersion = true, nodeRegistry, kind } = opts
  const queryClient = useQueryClient()
  const goTo = useGoTo()
  const scope = useEditorScope()
  const { markClean, setWorkflowId, runValidation } = useWorkflowStore()
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  const performSave = useCallback(async (): Promise<WorkflowSummary | null> => {
    const state = useWorkflowStore.getState()
    const ir = buildIRFromState(state)

    // A blank row, or a bare "SECRET_", is a half-typed line in the editor
    // and not a variable. Sending it fails the API's name check and takes
    // the whole save down with it — the IR builder drops these too.
    const envVars = state.workflowEnvVars.flatMap((v) => {
      const { name, isSecret } = splitSecretName(v.name)
      const trimmed = name.trim()
      return trimmed ? [{ name: trimmed, isSecret, value: v.value }] : []
    })
    // Trigger code and dependencies are project files (handlers.ts,
    // package.json) edited in the code workspace; the canvas only mirrors
    // them, so it never writes them back.
    const deployConfig = state.deployConfig.route ? state.deployConfig : undefined

    if (isNew) {
      const created = await api.createWorkflow({
        name: state.metadata.name,
        description: state.metadata.description,
        kind,
      })
      if (envVars || deployConfig) {
        await api.updateWorkflow(created.id, { envVars, deployConfig })
      }
      await api.createVersion(created.id, { ir })
      return created
    }

    await api.updateWorkflow(workflowId, {
      name: state.metadata.name,
      description: state.metadata.description,
      envVars,
      deployConfig,
    })
    // Nothing drawn and nothing saved before: the settings are stored, and
    // there is no graph to make a version of.
    if (!hasVersion && state.nodes.length === 0) return null
    await api.createVersion(workflowId, { ir })
    return null
  }, [isNew, hasVersion, kind, workflowId])

  const onSaveSuccess = useCallback(
    (created: WorkflowSummary | null) => {
      markClean()
      setLastSavedAt(new Date())
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] })
      if (created) {
        window.history.replaceState(null, '', `/workflows/${created.id}/editor?view=canvas`)
        setWorkflowId(created.id)
        if (isNew) {
          queryClient.invalidateQueries({ queryKey: ['workflows'] })
        }
      }
    },
    [markClean, queryClient, workflowId, setWorkflowId, isNew],
  )

  const saveMutation = useMutation({
    // The toolbar's save status keeps the reason too, but only on hover and
    // only from a wide screen, so the toast carries it as well.
    meta: {
      toast: { success: 'Workflow saved', error: 'Couldn’t save the workflow' },
    },
    mutationFn: performSave,
    onSuccess: onSaveSuccess,
    onError: (err) => setSaveError(failureLine(err, 'Failed to save workflow')),
  })

  /**
   * Saves and reports whether it worked, for callers that do something next
   * — switching surface, say. Both failure paths have already told the user
   * why (the validation panel, or the save toast and status), so the
   * boolean is only about whether to carry on.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
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
    // A rename on a workflow nobody has drawn yet is still worth keeping: it
    // saves as settings, without a version.
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
  }, [saveMutation, isNew, hasVersion])

  const handleSave = useCallback(() => {
    void saveNow()
  }, [saveNow])

  const saveSilent = useCallback(async (): Promise<AutoSaveOutcome> => {
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
      setSaveError(failureLine(err, 'Failed to save workflow'))
      return 'failed'
    } finally {
      setIsAutoSaving(false)
    }
  }, [performSave, onSaveSuccess])

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
      try {
        await saveMutation.mutateAsync()
      } catch {
        // The save already said it failed: one toast, not two.
        return
      }
    }
    const targetId = isNew ? (useWorkflowStore.getState().workflowId ?? workflowId) : workflowId
    // Deploy opens in the shell the editor is in: its workspace, or the old pages.
    goTo(workflowLinks(scope, targetId).deploy)
  }, [runValidation, isDirty, isNew, saveMutation, nodeRegistry, goTo, scope, workflowId])

  return {
    handleSave,
    saveNow,
    handleDeploy,
    saveSilent,
    isSaving: saveMutation.isPending || isAutoSaving,
    lastSavedAt,
    saveError,
  }
}
