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

/** A refusal from better-auth's client, as the pages read every other one. */
export function authError(
  error: { message?: string; error?: string; status?: number; code?: string } | null,
  fallback: string,
  field?: string,
): ApiError {
  // better-auth answers `message`; the API in front of it (the body limit) answers `error`.
  const message = error?.message ?? error?.error ?? fallback
  return new ApiError(message, error?.status ?? 400, { field })
}

/** better-auth's answer when an action needs a sign-in from the last day. */
export function needsFreshSignIn(error: { code?: string } | null): boolean {
  return error?.code === 'SESSION_NOT_FRESH' || error?.code === 'SESSION_EXPIRED'
}
