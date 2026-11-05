import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { type WorkflowSummary } from '../../lib/api-client'
import { workspacePath } from '../../lib/dashboard-paths'
import { downloadJsonFile } from '../../lib/download-file'
import { workflowLinks } from '../../lib/workflows/detail-links'
import { useGoTo } from '../navigation/router-shell-link'
import { useApi } from '../../contexts/api-client-context'

function irFileName(name: string) {
  return `${name.replace(/\s+/g, '-').toLowerCase()}.ir.json`
}

function kindWord(workflow: WorkflowSummary): string {
  return workflow.kind === 'script' ? 'function' : 'workflow'
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Duplicate, Export IR, Take down and Delete for one workflow, shared by its
 * page's ⋯ menu and the old list's. Navigation stays in the shell it runs in.
 */
export function useWorkflowActions(workflow: WorkflowSummary) {
  const api = useApi()
  const navigate = useNavigate()
  const goTo = useGoTo()
  const scope = useEditorScope()
  const queryClient = useQueryClient()
  const word = kindWord(workflow)
  const Word = capitalised(word)

  function invalidateLists() {
    void queryClient.invalidateQueries({ queryKey: ['workflows'] })
    void queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
    // The dashboard's lists live under 'dash'.
    void queryClient.invalidateQueries({ queryKey: ['dash'] })
  }

  const remove = useMutation({
    meta: { toast: { success: `${Word} deleted`, error: `Couldn’t delete the ${word}` } },
    mutationFn: () => api.deleteWorkflow(workflow.id),
    onSuccess: async () => {
      invalidateLists()
      // Back to the list it was in, replacing the gone page so Back can't reopen it.
      if (scope) {
        goTo(workspacePath(scope, workflow.kind === 'script' ? 'functions' : 'workflows'), {
          replace: true,
        })
      } else {
        await navigate({ to: '/workflows', replace: true })
      }
    },
  })

  const takedown = useMutation({
    meta: { toast: { success: `${Word} taken down`, error: `Couldn’t take the ${word} down` } },
    mutationFn: async () => {
      // The account it went out with, latest first: the API takes down only from one of those.
      const targets = await api.getDeployConnections(workflow.id)
      const connectionId = targets.deployedWith[0]?.id
      if (!connectionId) throw new Error('It isn’t deployed anywhere')
      const result = await api.takedownDeployment(workflow.id, connectionId)
      if (!result.success) throw new Error(result.error ?? `Couldn’t take the ${word} down`)
      return result
    },
    onSuccess: () => {
      invalidateLists()
      void queryClient.invalidateQueries({ queryKey: ['deployments', workflow.id] })
      void queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] })
    },
  })

  const duplicate = useMutation({
    meta: { toast: { success: `${Word} duplicated`, error: `Couldn’t duplicate the ${word}` } },
    mutationFn: async () => {
      const copy = await api.createWorkflow({
        name: `${workflow.name} (copy)`,
        // None is null from the API, which the create refuses.
        description: workflow.description ?? undefined,
        kind: workflow.kind,
        // The copy stays beside the original, not in the project's first workspace.
        workspaceId: workflow.workspaceId,
      })
      if (workflow.currentVersionId) {
        const ver = await api.getVersion(workflow.id, workflow.currentVersionId)
        await api.createVersion(copy.id, { ir: JSON.parse(ver.ir) })
      }
      return copy
    },
    onSuccess: (copy) => {
      invalidateLists()
      goTo(workflowLinks(scope, copy.id).overview)
    },
  })

  const exportIr = useMutation({
    meta: { toast: { success: `${Word} exported`, error: `Couldn’t export the ${word}` } },
    mutationFn: async () => {
      if (!workflow.currentVersionId) throw new Error('No version to export')
      const ver = await api.getVersion(workflow.id, workflow.currentVersionId)
      return ver.ir
    },
    onSuccess: (irJson) => downloadJsonFile(irFileName(workflow.name), irJson),
  })

  return { remove, takedown, duplicate, exportIr }
}
