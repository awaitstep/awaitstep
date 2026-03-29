import { useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useOrgStore } from '../stores/org-store'
import { useShallow } from 'zustand/react/shallow'
import RunsWrapper from './runs'
import WorkflowsWrapper from './workflows'
import { queries, flatPages } from '../lib/queries'

export default function ProjectsWrapper() {
  const { activeOrganizationId, canFetch, activeProjectId } = useOrgStore(
    useShallow((s) => ({
      activeOrganizationId: s.activeOrganizationId,
      canFetch: s.appReady && !!s.activeOrganizationId,
      activeProjectId: s.activeProjectId,
    })),
  )

  const {
    setProjects,
    setProjectsFetchState,
    setActiveProject,
    setProjectsPagination,
    setProjectsIsFetchingMore,
  } = useOrgStore()

  const { data, isError, isSuccess, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      ...queries.projects.list(activeOrganizationId ?? ''),
      enabled: canFetch,
      retry: false,
    })

  const allProjects = flatPages(data)

  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (isSuccess) {
      setProjects(allProjects)
      setProjectsFetchState('success')
      if (allProjects.length) {
        if (!activeProjectId || !allProjects.find((p) => p.id === activeProjectId)) {
          setActiveProject(allProjects[0].id)
        }
      }
    }
  }, [isSuccess, data])

  useEffect(() => {
    setProjectsPagination(!!hasNextPage, hasNextPage ? handleLoadMore : null)
  }, [hasNextPage, handleLoadMore, setProjectsPagination])

  useEffect(() => {
    setProjectsIsFetchingMore(isFetchingNextPage)
  }, [isFetchingNextPage, setProjectsIsFetchingMore])

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
