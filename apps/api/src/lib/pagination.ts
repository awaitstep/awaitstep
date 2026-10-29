import { z } from 'zod'
import { isCursor } from '@awaitstep/db'

export const paginationQuerySchema = z.object({
  // Checked here so a malformed cursor is a 422 on every list, not a 500 from the query.
  cursor: z.string().refine(isCursor, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
