import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../lib/api-client'
import { useOrgStore } from '../stores/org-store'
import { useRunsStore } from '../stores/runs-store'
import { useActiveRunSync } from '../hooks/use-active-run-sync'

export default function RunsWrapper() {
  const { canFetch, activeProjectId } = useOrgStore(useShallow((s) => ({
    canFetch: s.appReady && !!s.activeProjectId && s.projects.some((p) => p.id === s.activeProjectId),
    activeProjectId: s.activeProjectId,
  })))

  const { setRuns, setFetchState } = useRunsStore()

  const { data, isError, isSuccess } = useQuery({
    queryKey: ['all-runs', activeProjectId],
    queryFn: () => api.listAllRuns(),
    enabled: canFetch,
    retry: false,
  })

  useActiveRunSync(data, ['all-runs', activeProjectId ?? ''])

  useEffect(() => {
    if (isSuccess) {
      setRuns(data)
      setFetchState('success')
    }
  }, [isSuccess, data, setRuns, setFetchState])

  useEffect(() => {
    if (isError) {
      setFetchState('error')
    }
  }, [isError, setFetchState])

  return null
}
