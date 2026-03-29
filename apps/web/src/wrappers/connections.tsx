import { useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../stores/org-store'
import { useConnectionsStore } from '../stores/connections-store'
import { queries, flatPages } from '../lib/queries'

export default function ConnectionsWrapper() {
  const { canFetch, activeOrgId } = useOrgStore(
    useShallow((s) => ({
      canFetch: s.appReady && !!s.activeOrganizationId,
      activeOrgId: s.activeOrganizationId,
    })),
  )

  const { setConnections, setFetchState, setPagination, setIsFetchingMore } = useConnectionsStore()

  const { data, isError, isSuccess, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      ...queries.connections.list(activeOrgId ?? ''),
      enabled: canFetch,
      retry: false,
    })

  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (isSuccess) {
      setConnections(flatPages(data))
      setFetchState('success')
    }
  }, [isSuccess, data, setConnections, setFetchState])

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
