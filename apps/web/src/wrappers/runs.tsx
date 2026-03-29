import { useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../stores/org-store'
import { useRunsStore } from '../stores/runs-store'
import { useActiveRunSync } from '../hooks/use-active-run-sync'
import { queries, flatPages } from '../lib/queries'

export default function RunsWrapper() {
  const { canFetch, activeProjectId } = useOrgStore(
    useShallow((s) => ({
      canFetch:
        s.appReady && !!s.activeProjectId && s.projects.some((p) => p.id === s.activeProjectId),
      activeProjectId: s.activeProjectId,
    })),
  )

  const { setRuns, setFetchState, setPagination, setIsFetchingMore } = useRunsStore()

  const { data, isError, isSuccess, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      ...queries.runs.all(activeProjectId ?? ''),
      enabled: canFetch,
      retry: false,
    })

  const allRuns = flatPages(data)

  useActiveRunSync(allRuns, ['all-runs', activeProjectId ?? ''])

  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (isSuccess) {
      setRuns(allRuns)
      setFetchState('success')
    }
  }, [isSuccess, data, setRuns, setFetchState])

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
