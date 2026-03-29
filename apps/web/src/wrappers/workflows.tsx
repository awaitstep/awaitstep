import { useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../stores/org-store'
import { useWorkflowsStore } from '../stores/workflows-store'
import { queries, flatPages } from '../lib/queries'

export default function WorkflowsWrapper() {
  const { canFetch, activeProjectId } = useOrgStore(
    useShallow((s) => ({
      canFetch:
        s.appReady && !!s.activeProjectId && s.projects.some((p) => p.id === s.activeProjectId),
      activeProjectId: s.activeProjectId,
    })),
  )

  const { setWorkflows, setFetchState, setPagination, setIsFetchingMore } = useWorkflowsStore()

  const { data, isError, isSuccess, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      ...queries.workflows.list(activeProjectId ?? ''),
      enabled: canFetch,
      retry: false,
    })

  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (isSuccess) {
      setWorkflows(flatPages(data))
      setFetchState('success')
    }
  }, [isSuccess, data, setWorkflows, setFetchState])

  useEffect(() => {
    setPagination(!!hasNextPage, hasNextPage ? handleLoadMore : null)
  }, [hasNextPage, handleLoadMore, setPagination])

  useEffect(() => {
    setIsFetchingMore(isFetchingNextPage)
  }, [isFetchingNextPage, setIsFetchingMore])

  useEffect(() => {
    if (isError) {
      setFetchState('error')
    }
  }, [isError, setFetchState])

  return null
}
