import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api-client'
import { useOrgStore } from '../stores/org-store'
import { useShallow } from 'zustand/react/shallow'
import RunsWrapper from './runs'
import WorkflowsWrapper from './workflows'

export default function ProjectsWrapper() {
  const { activeOrganizationId, canFetch, activeProjectId } = useOrgStore(
    useShallow((s) => ({
      activeOrganizationId: s.activeOrganizationId,
      canFetch: s.appReady && !!s.activeOrganizationId,
      activeProjectId: s.activeProjectId,
    })),
  )

  const { setProjects, setProjectsFetchState, setActiveProject } = useOrgStore()

  const { data, isError, isSuccess } = useQuery({
    queryKey: ['projects', activeOrganizationId],
    queryFn: () => api.listProjects(),
    enabled: canFetch,
    retry: false,
  })

  useEffect(() => {
    if (isSuccess) {
      setProjects(data)
      setProjectsFetchState('success')
      if (data.length) {
        if (!activeProjectId || !data.find((p) => p.id === activeProjectId)) {
          setActiveProject(data[0].id)
        }
      }
    }
  }, [isSuccess, data])

  useEffect(() => {
    if (isError) {
      setProjectsFetchState('error')
    }
  }, [isError])

  return (
    <>
      <RunsWrapper />
      <WorkflowsWrapper />
    </>
  )
}
