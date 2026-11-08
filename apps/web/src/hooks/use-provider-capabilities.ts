import { useEffect, useSyncExternalStore } from 'react'
import type { ProviderCapabilities } from '@awaitstep/codegen'
import { useApi } from '../contexts/api-client-context'
import type { ApiClient } from '../lib/api-client'

let capabilities: ProviderCapabilities[] = []
let status: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
let pending: Promise<void> | null = null
let retry: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function publish(next: ProviderCapabilities[], nextStatus: typeof status): void {
  capabilities = next
  status = nextStatus
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ProviderCapabilities[] {
  return capabilities
}

function load(api: ApiClient): void {
  if (pending) return
  const request = api.getProviders?.()
  if (!request) return
  if (status === 'idle') publish(capabilities, 'loading')
  pending = request
    .then((result) => publish(result.providers, 'ready'))
    .catch(() => {
      publish(capabilities, 'error')
      // A transient 401/network failure must not disable the capability UI for
      // the session; retry once the current backoff elapses.
      if (retry === null) {
        retry = setTimeout(() => {
          retry = null
          load(api)
        }, 2_000)
      }
    })
    .finally(() => {
      pending = null
    })
}

/**
 * The provider capabilities the dashboard can offer. Shared UI must not
 * hardcode a provider's handler kinds or queue rules; until the list loads it
 * offers the neutral minimum (an HTTP handler). Module-cached so every menu
 * shares one request and tests without a query client still work. A failed
 * request keeps the last successful list and retries.
 */
export function useProviderCapabilities(): ProviderCapabilities[] {
  const api = useApi()
  useEffect(() => {
    load(api)
  }, [api])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Test/workspace reset: drops the cache, pending request and retry. */
export function resetProviderCapabilities(): void {
  if (retry !== null) clearTimeout(retry)
  retry = null
  pending = null
  capabilities = []
  status = 'idle'
  for (const listener of listeners) listener()
}
