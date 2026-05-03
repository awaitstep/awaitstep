import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWorkflowStore } from '../stores/workflow-store'
import { validateWorkflowForPublish } from '../lib/validate-workflow'
import { buildIRFromState } from '../lib/build-ir'
import { api, type WorkflowSummary } from '../lib/api-client'
import type { NodeRegistry } from '@awaitstep/ir'

export type AutoSaveOutcome = 'saved' | 'skipped' | 'failed'

export function useWorkflowPersistence(opts: {
  workflowId: string
  isNew: boolean
  isDirty: boolean
  nodeRegistry: NodeRegistry | null | undefined
  /** Only honored on first save (when `isNew`). Defaults to 'workflow'. */
  kind?: 'workflow' | 'script'
}) {
  const { workflowId, isNew, isDirty, nodeRegistry, kind } = opts
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { markClean, setWorkflowId, runValidation } = useWorkflowStore()
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  const performSave = useCallback(async (): Promise<WorkflowSummary | null> => {
    const state = useWorkflowStore.getState()
    const ir = buildIRFromState(state)

    const SECRET_PREFIX = 'SECRET_'
    const envVars = state.workflowEnvVars.map((v) => {
      if (v.name.startsWith(SECRET_PREFIX)) {
        return { name: v.name.slice(SECRET_PREFIX.length), value: v.value, isSecret: true }
      }
      return { name: v.name, value: v.value, isSecret: false }
    })
    const triggerCode = state.triggerCode || undefined
    const dependencies = Object.keys(state.dependencies).length > 0 ? state.dependencies : undefined
    const deployConfig = state.deployConfig.route ? state.deployConfig : undefined

    if (isNew) {
      const created = await api.createWorkflow({
        name: state.metadata.name,
        description: state.metadata.description,
        kind,
      })
      if (envVars || triggerCode || dependencies || deployConfig) {
        await api.updateWorkflow(created.id, { envVars, triggerCode, dependencies, deployConfig })
      }
      await api.createVersion(created.id, { ir })
      return created
    }

    await api.updateWorkflow(workflowId, {
      name: state.metadata.name,
      description: state.metadata.description,
      envVars,
      triggerCode,
      dependencies,
      deployConfig,
    })
    await api.createVersion(workflowId, { ir })
    return null
  }, [isNew, kind, workflowId])

  const onSaveSuccess = useCallback(
    (created: WorkflowSummary | null) => {
      markClean()
      setLastSavedAt(new Date())
      setAutoSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      if (created) {
        window.history.replaceState(null, '', `/workflows/${created.id}/canvas`)
        setWorkflowId(created.id)
        if (isNew) {
          queryClient.invalidateQueries({ queryKey: ['workflows'] })
        }
      }
    },
    [markClean, queryClient, workflowId, setWorkflowId, isNew],
  )

  const saveMutation = useMutation({
    mutationFn: performSave,
    onSuccess: (created) => {
      onSaveSuccess(created)
      toast.success('Workflow saved')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save workflow')
    },
  })

  const handleSave = useCallback(() => {
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
    if (!result.canPublish) {
      const errors = result.issues.filter((i) => i.severity === 'error')
      for (const issue of errors) {
        toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      return
    }
    saveMutation.mutate()
  }, [saveMutation])

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
      setAutoSaveError(err instanceof Error ? err.message : 'Failed to save workflow')
      return 'failed'
    } finally {
      setIsAutoSaving(false)
    }
  }, [performSave, onSaveSuccess])

  const handleDeploy = useCallback(async () => {
    const result = runValidation(nodeRegistry ?? undefined)
    if (!result.canPublish) {
      const errors = result.issues.filter((i) => i.severity === 'error')
      const warnings = result.issues.filter((i) => i.severity === 'warning')
      for (const issue of errors) {
        toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      for (const issue of warnings) {
        toast.warning(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      return
    }
    if (isDirty || isNew) {
      try {
        await saveMutation.mutateAsync()
      } catch {
        toast.error('Failed to save before deploy')
        return
      }
    }
    const targetId = isNew ? (useWorkflowStore.getState().workflowId ?? workflowId) : workflowId
    navigate({ to: '/workflows/$workflowId/deploy', params: { workflowId: targetId } })
  }, [runValidation, isDirty, isNew, saveMutation, nodeRegistry, navigate, workflowId])

  return {
    handleSave,
    handleDeploy,
    saveSilent,
    isSaving: saveMutation.isPending || isAutoSaving,
    lastSavedAt,
    autoSaveError,
  }
}
