import { ApiError } from '../../lib/api-client'

/**
 * The extra line under the Nodes list when this instance has no registry (or
 * can't reach it). Shared by Resources › Nodes and the canvas marketplace.
 */
export function registryDetail(error: unknown): string | undefined {
  return error instanceof ApiError && error.status === 503
    ? 'This instance can’t reach the node registry. Nodes already installed keep working in the editor.'
    : undefined
}
