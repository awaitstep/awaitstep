import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '../lib/api-client'

// An extension's own API, mounted by the server under `/api/ext/<id>`. Its
// pages read and write it through these, on the dashboard's query client.

const keyOf = (extensionId: string, path: string) => ['ext', extensionId, path] as const

/** Reads `path` of an extension's API (`/workspaces/w1/things`). */
export function useExtensionQuery<T>(extensionId: string, path: string, enabled = true) {
  return useQuery({
    queryKey: keyOf(extensionId, path),
    queryFn: () => request<T>(`/ext/${extensionId}${path}`),
    enabled,
  })
}

export interface ExtensionWrite<TInput> {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Where the write goes, for this input. */
  path: (input: TInput) => string
  /** The JSON body, when the write has one. */
  body?: (input: TInput) => unknown
  /** A path read with `useExtensionQuery` that the write changes: it is read again. */
  refreshes?: string
  /** What the toast says when it worked, and when it did not. */
  toast?: { success: string; error: string }
}

/** Writes to an extension's API. */
export function useExtensionMutation<TInput, TResult = unknown>(
  extensionId: string,
  write: ExtensionWrite<TInput>,
) {
  const client = useQueryClient()
  return useMutation({
    ...(write.toast && { meta: { toast: write.toast } }),
    mutationFn: (input: TInput) =>
      request<TResult>(`/ext/${extensionId}${write.path(input)}`, {
        method: write.method,
        ...(write.body && { body: JSON.stringify(write.body(input)) }),
      }),
    onSettled: () =>
      write.refreshes === undefined
        ? undefined
        : client.invalidateQueries({ queryKey: keyOf(extensionId, write.refreshes) }),
  })
}
