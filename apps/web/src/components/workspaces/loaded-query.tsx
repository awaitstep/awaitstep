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
  /** What a failure says, when it can say more than "took too long". */
  errorDetail?: (error: unknown) => string | undefined
  /** Around the error card and the skeleton only, e.g. padding where the list draws its own edges. */
  stateClassName?: string
  children: (data: T) => ReactNode
}

/** A list's error card, its skeleton, or the list: for tabs that each load their own query. */
export function LoadedQuery<T>({
  query,
  what,
  filters,
  errorDetail,
  stateClassName,
  children,
}: LoadedQueryProps<T>) {
  function handleRetry() {
    void query.refetch()
  }

  if (query.isError) {
    const card = (
      <WorkspaceLoadError
        what={what}
        error={query.error}
        onRetry={handleRetry}
        retrying={query.isFetching}
        detail={errorDetail?.(query.error)}
      />
    )
    return stateClassName ? <div className={stateClassName}>{card}</div> : card
  }
  if (query.data === undefined) {
    const skeleton = (
      <LoadingRegion label={`Loading ${what}`}>
        {filters && <FilterSkeleton count={3} />}
        <ListCardSkeleton rows={2} trailing={2} />
        <ListCardSkeleton rows={2} trailing={2} />
      </LoadingRegion>
    )
    return stateClassName ? <div className={stateClassName}>{skeleton}</div> : skeleton
  }
  return children(query.data)
}
