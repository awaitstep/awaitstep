import type { Mutation } from '@tanstack/react-query'
import { toast } from 'sonner'

// Every action answers with a toast, on success and on failure. Success is a
// short line ("Profile saved"). A failure says why: a refusal (4xx) shows the
// reason the server sent ("This invite was sent less than ten minutes ago"); a
// server failure (5xx), a lost connection or a bug shows the action's general
// line ("Couldn't resend the invite"), see `failureLine`. This file is the only
// caller of sonner's `toast`: mutations declare `meta.toast` and the query
// client's MutationCache announces them; other actions call `runAction`, or
// `actionToast` with `failureLine` where the outcome is judged by hand. A
// message can never break the action it describes: one that throws is dropped.

type SuccessMessage = string | ((variables: unknown, data: unknown) => string)
type ErrorMessage = string | ((variables: unknown) => string)

/**
 * What an action says when it finishes. `success: null` is for an action whose
 * outcome shows by itself (it navigates away, or a dot disappears): a failure
 * still toasts.
 */
export interface ActionToast {
  success: SuccessMessage | null
  /** The general line, for a failure that brings no reason of its own. */
  error: ErrorMessage
}

/**
 * A mutation's `meta.toast`: what it says, or `'silent'` for an action the
 * person did not click (say why in a comment beside it).
 */
export type ActionToastMeta = ActionToast | 'silent'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { toast: ActionToastMeta }
  }
}

/** Extra content for the rare toast that needs it: a button, or a detail with no other home. */
export interface ActionToastOptions {
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}

const CARRIED_KEY = 'awaitstep:action-toast'

/** How long a toast stays (board `Toasts`): 4 s by default (the Toaster), 6 s for errors, 8 s with an action. */
export const ERROR_TOAST_MS = 6_000
export const ACTION_TOAST_MS = 8_000
/** For a notice with instructions to act on, though it has no button. */
export const LONG_TOAST_MS = ACTION_TOAST_MS

let nextToast = 0

/**
 * Sonner options for one toast: the board's durations, and an id it also
 * carries as `data-testid`, so the Toaster can dismiss the one in focus.
 */
function toastOptions(kind: 'success' | 'error' | 'info', options?: ActionToastOptions) {
  const id = `action-toast-${++nextToast}`
  const duration =
    options?.duration ??
    (options?.action ? ACTION_TOAST_MS : kind === 'error' ? ERROR_TOAST_MS : undefined)
  return { ...options, id, testId: id, ...(duration !== undefined && { duration }) }
}

export const actionToast = {
  success(text: string, options?: ActionToastOptions) {
    toast.success(text, toastOptions('success', options))
  },
  error(text: string, options?: ActionToastOptions) {
    toast.error(text, toastOptions('error', options))
  },
  /** A notice that is not an action's outcome: undo and redo, a read-only file, discarded edits. */
  info(text: string, options?: ActionToastOptions) {
    toast.info(text, toastOptions('info', options))
  },
  /** A success line for the page the browser loads next (an action that reloads, like signing out). */
  successAfterReload(text: string, now = Date.now()) {
    try {
      sessionStorage.setItem(CARRIED_KEY, JSON.stringify({ text, at: now }))
    } catch {
      // Storage blocked: the next page simply shows no toast.
    }
  },
}

/** A carried line older than this belongs to a reload that never happened: it is dropped. */
export const CARRIED_TOAST_MAX_AGE_MS = 30_000

/** Shows the line `successAfterReload` left, once and only while fresh; the Toaster calls it when it mounts. */
export function showCarriedToast(now = Date.now()) {
  let carried: { text?: unknown; at?: unknown } | null
  try {
    const raw = sessionStorage.getItem(CARRIED_KEY)
    sessionStorage.removeItem(CARRIED_KEY)
    carried = raw ? (JSON.parse(raw) as typeof carried) : null
  } catch {
    return
  }
  if (typeof carried?.text !== 'string' || typeof carried.at !== 'number') return
  if (now - carried.at > CARRIED_TOAST_MAX_AGE_MS) return
  actionToast.success(carried.text)
}

/**
 * Builds a `meta.toast` whose messages name the thing acted on, typed by the
 * mutation's own variables and result.
 */
export function defineToast<TVariables = void, TData = unknown>(messages: {
  success: string | ((variables: TVariables, data: TData) => string) | null
  error: string | ((variables: TVariables) => string)
}): ActionToast {
  return messages as ActionToast
}

/** The lines a `meta.toast` gives for these variables and result; null where it stays quiet. */
export function toastLines(meta: ActionToastMeta | undefined, variables: unknown, data?: unknown) {
  return { success: successText(meta, variables, data), error: errorText(meta, variables) }
}

/** A message function's line, or null when it throws: a bad message never fails the action. */
function safely(line: () => string): string | null {
  try {
    return line()
  } catch {
    return null
  }
}

function successText(meta: ActionToastMeta | undefined, variables: unknown, data: unknown) {
  if (!meta || meta === 'silent' || meta.success === null) return null
  const success = meta.success
  return typeof success === 'function' ? safely(() => success(variables, data)) : success
}

function errorText(meta: ActionToastMeta | undefined, variables: unknown) {
  if (!meta || meta === 'silent') return null
  const error = meta.error
  return typeof error === 'function' ? safely(() => error(variables)) : error
}

/**
 * What a failed action says. A refusal carries the server's reason: an error
 * with a 4xx `status` (ApiError, the dummy server's, a file conflict), or a
 * plain `Error` the app threw on purpose with one. A response with no reason
 * (a proxy's HTML page), a server failure (5xx), a
 * lost connection (`TypeError: Failed to fetch`) or a bug (any other error
 * type) gets the general line instead.
 */
export function failureLine(error: unknown, general: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return general
  if ((error as { hasReason?: unknown }).hasReason === false) return general
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number') return status >= 500 ? general : error.message
  return Object.getPrototypeOf(error) === Error.prototype ? error.message : general
}

type AnyMutation = Mutation<unknown, unknown, unknown, unknown>

/**
 * The query client's MutationCache handlers. They run for every mutation, even
 * when the component that started it has unmounted (a dialog that closes on
 * success still toasts).
 */
export const mutationToastHandlers = {
  onSuccess(data: unknown, variables: unknown, _result: unknown, mutation: AnyMutation) {
    const text = successText(mutation.meta?.toast, variables, data)
    if (text) actionToast.success(text)
  },
  onError(error: unknown, variables: unknown, _result: unknown, mutation: AnyMutation) {
    const text = errorText(mutation.meta?.toast, variables)
    if (text) actionToast.error(failureLine(error, text))
  },
}

/**
 * Runs an action that is not a React Query mutation (a direct `api.*` call)
 * and toasts its outcome; `error` is the general line (see `failureLine`). A
 * failure is toasted and then thrown again, so the caller keeps its own
 * inline handling.
 */
export async function runAction<T>(
  work: Promise<T> | (() => Promise<T>),
  messages: { success: string | ((data: T) => string); error: string },
): Promise<T> {
  let data: T
  try {
    data = await (typeof work === 'function' ? work() : work)
  } catch (err) {
    actionToast.error(failureLine(err, messages.error))
    throw err
  }
  const success = messages.success
  const text = typeof success === 'function' ? safely(() => success(data)) : success
  if (text) actionToast.success(text)
  return data
}
