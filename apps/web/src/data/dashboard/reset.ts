import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { resetMockDb } from '../../mocks/dashboard/db'

/** "Reset dummy data": drops the tab's changes and refetches every dashboard query. Dev-only. */
export function useResetMockData(): () => Promise<void> {
  const client = useQueryClient()
  return useCallback(() => {
    resetMockDb()
    return client.invalidateQueries({ queryKey: ['dash'] })
  }, [client])
}
