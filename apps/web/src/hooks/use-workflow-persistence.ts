import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useWorkflowStore } from '../stores/workflow-store'
import { validateWorkflowForPublish } from '../lib/validate-workflow'
import { buildIRFromState } from '../lib/build-ir'
import { api, type WorkflowSummary } from '../lib/api-client'
import type { NodeRegistry } from '@awaitstep/ir'

export function useWorkflowPersistence(opts: {
  workflowId: string
  isNew: boolean
  isDirty: boolean
  nodeRegistry: NodeRegistry | null | undefined
}) {
  const { workflowId, isNew, isDirty, nodeRegistry } = opts
  const queryClient = useQueryClient()
  const [deployOpen, setDeployOpen] = useState(false)
  const markClean = useWorkflowStore((s) => s.markClean)
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId)
  const runValidation = useWorkflowStore((s) => s.runValidation)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = useWorkflowStore.getState()
      const ir = buildIRFromState(state)

      const envVars = state.workflowEnvVars.length > 0 ? state.workflowEnvVars : undefined
      const triggerCode = state.triggerCode || undefined
      const dependencies =
        Object.keys(state.dependencies).length > 0 ? state.dependencies : undefined

      if (isNew) {
        const created = await api.createWorkflow({
          name: state.metadata.name,
          description: state.metadata.description,
        })
        if (envVars || triggerCode || dependencies)
          await api.updateWorkflow(created.id, { envVars, triggerCode, dependencies })
        await api.createVersion(created.id, { ir })
        return created
      }

      await api.updateWorkflow(workflowId, {
        name: state.metadata.name,
        description: state.metadata.description,
        envVars,
        triggerCode,
        dependencies,
      })
      await api.createVersion(workflowId, { ir })
      return null
    },
    onSuccess: (created: WorkflowSummary | null) => {
      markClean()
      toast.success('Workflow saved')
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      if (created) {
        window.history.replaceState(null, '', `/workflows/${created.id}/canvas`)
        setWorkflowId(created.id)
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save workflow')
    },
  })

  const handleSave = useCallback(() => {
    const state = useWorkflowStore.getState()
    const result = validateWorkflowForPublish(state.metadata, state.nodes, state.edges)
    if (!result.canPublish) {
      const errors = result.issues.filter((i) => i.severity === 'error')
      for (const issue of errors) {
        toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      return
    }
    saveMutation.mutate()
  }, [saveMutation])

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
    setDeployOpen(true)
  }, [runValidation, isDirty, isNew, saveMutation, nodeRegistry])

  return {
    handleSave,
    handleDeploy,
    isSaving: saveMutation.isPending,
    deployOpen,
    setDeployOpen,
  }
}
