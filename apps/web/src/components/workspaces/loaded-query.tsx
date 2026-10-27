import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { WorkspaceLoadError } from './workspace-load-error'

interface LoadedQueryProps<T> {
  query: UseQueryResult<T>
  /** "variables": "Loading variables", then "We couldn’t load variables" if it fails. */
  what: string
  /** The tab opens with a filter bar: its placeholder leads the skeleton. */
  filters?: boolean
  children: (data: T) => ReactNode
}

/** A list's error card, its skeleton, or the list: for tabs that each load their own query. */
export function LoadedQuery<T>({ query, what, filters, children }: LoadedQueryProps<T>) {
  function handleRetry() {
    void query.refetch()
  }

  if (query.isError) {
    return (
      <WorkspaceLoadError
        what={what}
        error={query.error}
        onRetry={handleRetry}
        retrying={query.isFetching}
      />
    )
  }
  if (query.data === undefined) {
    return (
      <LoadingRegion label={`Loading ${what}`}>
        {filters && <FilterSkeleton count={3} />}
        <ListCardSkeleton rows={2} trailing={2} />
        <ListCardSkeleton rows={2} trailing={2} />
      </LoadingRegion>
    )
  }
  return children(query.data)
}
