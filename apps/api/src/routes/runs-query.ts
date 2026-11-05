import { z } from 'zod'
import type { WorkspaceRunFilter } from '@awaitstep/db'
import { paginationQuerySchema } from '../lib/pagination.js'

const PERIOD_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const

export const runsQuerySchema = paginationQuerySchema.extend({
  result: z.enum(['succeeded', 'failed', 'running']).optional(),
  period: z.enum(['24h', '7d', '30d']).optional(),
  search: z.string().max(200).optional(),
  /** One workflow's runs in the workspace. */
  workflowId: z.string().min(1).max(64).optional(),
})

export type RunsQuery = z.infer<typeof runsQuerySchema>

/** The Runs page's filters as the adapter takes them; the period becomes an instant. */
export function workspaceRunFilter(query: RunsQuery, now = new Date()): WorkspaceRunFilter {
  return {
    result: query.result,
    since: query.period
      ? new Date(now.getTime() - PERIOD_MS[query.period]).toISOString()
      : undefined,
    search: query.search,
    workflowId: query.workflowId,
    cursor: query.cursor,
    limit: query.limit,
  }
}
