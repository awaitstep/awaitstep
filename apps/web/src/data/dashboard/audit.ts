import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { mockServer } from '../../mocks/dashboard/server'
import type { AuditEvent, AuditFilter } from '../../types/dashboard/audit'
import { collectPages } from './export-pages'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/**
 * One page of the org's audit log, newest first. Off for people who can't
 * see it (`enabled`), so the page shows its notice instead of an error.
 */
export function useAuditLog(org: string, filter: AuditFilter, enabled = true) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.audit(org, filter), ctx),
    queryFn: () => mockServer.audit.listAuditEvents(ctx, org, filter),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Audit log → Export CSV: every event matching `filter`, up to `EXPORT_CAP`. Skips the cache. */
export function useAuditExport(org: string) {
  const ctx = useMockContext()
  return useCallback(
    (filter: Omit<AuditFilter, 'cursor' | 'limit'>): Promise<AuditEvent[]> =>
      collectPages((cursor, limit) =>
        mockServer.audit.listAuditEvents(ctx, org, { ...filter, cursor, limit }),
      ),
    [ctx, org],
  )
}
