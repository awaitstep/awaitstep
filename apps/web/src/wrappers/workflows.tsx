import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../lib/api-client'
import { useOrgStore } from '../stores/org-store'
import { useWorkflowsStore } from '../stores/workflows-store'

export default function WorkflowsWrapper() {
  const { canFetch, activeProjectId } = useOrgStore(useShallow((s) => ({
    canFetch: s.appReady && !!s.activeProjectId && s.projects.some((p) => p.id === s.activeProjectId),
    activeProjectId: s.activeProjectId,
  })))

  const { setWorkflows, setFetchState } = useWorkflowsStore()

  const { data, isError, isSuccess } = useQuery({
    queryKey: ['workflows', activeProjectId],
    queryFn: () => api.listWorkflows(),
    enabled: canFetch,
    retry: false,
  })

  useEffect(() => {
    if (isSuccess) {
      setWorkflows(data)
      setFetchState('success')
    }
  }, [isSuccess, data, setWorkflows, setFetchState])

  useEffect(() => {
    if (isError) {
      setFetchState('error')
    }
  }, [isError, setFetchState])

  return null
}
