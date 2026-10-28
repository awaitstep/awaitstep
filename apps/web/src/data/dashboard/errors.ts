import { ApiError } from '../../lib/api-client'
import { MockApiError } from '../../mocks/dashboard/scenario'

/**
 * The request ID a failed dashboard call carries, for "Error ID req_…" on
 * error states: the API's `X-Request-Id`, or the dummy server's.
 */
export function errorIdOf(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.requestId
  return error instanceof MockApiError ? error.errorId : undefined
}

/** The form field a failed save points at (`name`, `slug`…), so the page puts the error under it. */
export function errorFieldOf(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.field
  return error instanceof MockApiError ? error.field : undefined
}
