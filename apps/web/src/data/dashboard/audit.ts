import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { dashboardApi } from '../../lib/dashboard-api'
import type { AuditEvent, AuditFilter, AuditPage } from '../../types/dashboard/audit'
import { collectPages } from './export-pages'
import { dashKeys } from './keys'

/**
 * One page of the org's audit log, newest first. Off for people who can't
 * see it (`enabled`), so the page shows its notice instead of an error.
 */
export function useAuditLog(org: string, filter: AuditFilter, enabled = true) {
  return useQuery({
    queryKey: dashKeys.audit(org, filter),
    queryFn: (): Promise<AuditPage> => dashboardApi.listAuditEvents(org, filter),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Audit log → Export CSV: every event matching `filter`, up to `EXPORT_CAP`. Skips the cache. */
export function useAuditExport(org: string) {
  return useCallback(
    (filter: Omit<AuditFilter, 'cursor' | 'limit'>): Promise<AuditEvent[]> =>
      collectPages((cursor, limit) =>
        dashboardApi.listAuditEvents(org, { ...filter, cursor, limit }),
      ),
    [org],
  )
}
