import { MockApiError } from '../../mocks/dashboard/scenario'

/**
 * The request ID a failed dashboard call carries, for "Error ID req_…" on
 * error states. B1 swaps this for the real API error's request ID.
 */
export function errorIdOf(error: unknown): string | undefined {
  return error instanceof MockApiError ? error.errorId : undefined
}

/** The form field a failed save points at (`name`, `slug`…), so the page puts the error under it. */
export function errorFieldOf(error: unknown): string | undefined {
  return error instanceof MockApiError ? error.field : undefined
}
