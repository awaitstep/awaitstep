import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../lib/api-client'
import { useOrgStore } from '../stores/org-store'
import { useConnectionsStore } from '../stores/connections-store'

export default function ConnectionsWrapper() {
  const { canFetch, activeOrgId } = useOrgStore(
    useShallow((s) => ({
      canFetch: s.appReady && !!s.activeOrganizationId,
      activeOrgId: s.activeOrganizationId,
    })),
  )

  const { setConnections, setFetchState } = useConnectionsStore()

  const { data, isError, isSuccess } = useQuery({
    queryKey: ['connections', activeOrgId],
    queryFn: () => api.listConnections(),
    enabled: canFetch,
    retry: false,
  })

  useEffect(() => {
    if (isSuccess) {
      setConnections(data)
      setFetchState('success')
    }
  }, [isSuccess, data, setConnections, setFetchState])

  useEffect(() => {
    if (isError) {
      setFetchState('error')
    }
  }, [isError, setFetchState])

  return null
}
