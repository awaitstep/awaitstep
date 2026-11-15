import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiReady, useQueries } from '../contexts/api-client-context'
import type { EditorLibraryModules } from '../lib/api-client'
import { slugsToResolve, type LibraryRoots } from '../lib/ide/unsaved-library'
import { useDebouncedValue } from './use-debounced-value'
import { WORKER_SYNC_DELAY_MS } from './use-project-language-service'

/**
 * The Library modules the edited code imports, resolved as the next deploy
 * would resolve them, while it imports something the saved code does not;
 * null otherwise (the saved bundle already says everything), and while
 * editing is off. One request for the whole set, once typing pauses; a slug
 * still being typed is asked for at each pause, which costs a request but
 * never a wrong answer.
 */
export function useUnsavedLibraryModules(
  workflowId: string,
  roots: LibraryRoots,
  enabled: boolean,
): EditorLibraryModules | null {
  const queries = useQueries()
  const ready = useApiReady()
  const key = useMemo(() => slugsToResolve(roots).join(','), [roots])
  const settled = useDebouncedValue(key, WORKER_SYNC_DELAY_MS)
  const slugs = useMemo(() => (settled ? settled.split(',') : []), [settled])
  const active = enabled && slugs.length > 0
  const { data } = useQuery({
    ...queries.workflows.libraryModules(workflowId, slugs),
    enabled: ready && active,
  })
  return active ? (data ?? null) : null
}
