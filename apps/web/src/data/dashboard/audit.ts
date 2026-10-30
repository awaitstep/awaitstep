import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { AuditEvent, AuditFilter, AuditPage } from '../../types/dashboard/audit'
import { collectPages } from './export-pages'
import { dashKeys } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/**
 * One page of the org's audit log, newest first. Off for people who can't
 * see it (`enabled`), so the page shows its notice instead of an error.
 */
export function useAuditLog(org: string, filter: AuditFilter, enabled = true) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.audit(org, filter)),
    queryFn: (): Promise<AuditPage> =>
      source === 'api'
        ? dashboardApi.listAuditEvents(org, filter)
        : mockServer.audit.listAuditEvents(ctx, org, filter),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Audit log → Export CSV: every event matching `filter`, up to `EXPORT_CAP`. Skips the cache. */
export function useAuditExport(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  return useCallback(
    (filter: Omit<AuditFilter, 'cursor' | 'limit'>): Promise<AuditEvent[]> =>
      collectPages((cursor, limit) =>
        source === 'api'
          ? dashboardApi.listAuditEvents(org, { ...filter, cursor, limit })
          : mockServer.audit.listAuditEvents(ctx, org, { ...filter, cursor, limit }),
      ),
    [source, ctx, org],
  )
}
