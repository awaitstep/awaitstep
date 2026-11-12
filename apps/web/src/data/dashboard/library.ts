import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import {
  libraryApi,
  type ApiLibraryItem,
  type ApiLibraryPublished,
  type ApiLibrarySummary,
  type ApiLibraryTree,
  type LibraryKind,
  type LibraryPlace,
} from '../../lib/library-api'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { notYet, useDashKey, useDataSource } from './source'

// Each Library write runs from a dialog that shows the API's reason itself,
// so a failure says nothing more as a toast.
const SHOWN_INLINE = () => null

/** One item's reads, outside the place's keys: the item is addressed by its id. */
export const libraryItemKeys = {
  all: (id: string) => ['library-item', id] as const,
  usages: (id: string) => ['library-item', id, 'usages'] as const,
  versions: (id: string) => ['library-item', id, 'versions'] as const,
  version: (id: string, version: string) => ['library-item', id, 'versions', version] as const,
  check: (id: string) => ['library-item', id, 'check'] as const,
  file: (id: string, path: string) => ['library-item', id, 'file', path] as const,
}

/**
 * What any library write can change: every Library page and tree of the
 * project (a project item shows in each workspace's), and the item's own reads.
 */
export function invalidateLibrary(
  client: QueryClient,
  place: Pick<LibraryPlace, 'org' | 'project'>,
  itemId?: string,
): Promise<void> {
  return invalidateAll(client, [
    dashKeys.inProject('library', place.org, place.project),
    ...(itemId ? [libraryItemKeys.all(itemId)] : []),
  ])
}

/** The Library page (28a/28b) in one request: rows, counts and the right to add. */
export function useLibrarySummary(place: LibraryPlace) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.library(place)),
    queryFn: (): Promise<ApiLibrarySummary> =>
      source === 'api'
        ? libraryApi.getSummary(place)
        : mockServer.library.getLibrarySummary(ctx, place),
  })
}

/** The Library IDE's explorer: every item the place owns with its files. The IDE reads the API. */
export function useLibraryTree(place: LibraryPlace) {
  return useQuery({
    queryKey: [...dashKeys.libraryTree(place), 'api'],
    queryFn: (): Promise<ApiLibraryTree> => libraryApi.getTree(place),
  })
}

/** Who uses the item and what it uses: fetched where it is shown (`enabled`). */
export function useLibraryUsages(id: string | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: libraryItemKeys.usages(id ?? ''),
    queryFn: () => libraryApi.getUsages(id!),
    enabled: enabled && id !== null,
  })
}

export function useLibraryVersions(id: string | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: libraryItemKeys.versions(id ?? ''),
    queryFn: () => libraryApi.listVersions(id!).then((res) => res.versions),
    enabled: enabled && id !== null,
  })
}

export function useLibraryVersion(id: string, version: string | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: libraryItemKeys.version(id, version ?? ''),
    queryFn: () => libraryApi.getVersion(id, version!),
    enabled: enabled && version !== null,
    // A version never changes once published.
    staleTime: Infinity,
  })
}

/** What a publish would do: its version and the problems that stop it. */
export function useLibraryCheck(id: string | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: libraryItemKeys.check(id ?? ''),
    queryFn: () => libraryApi.check(id!),
    enabled: enabled && id !== null,
  })
}

export interface NewLibraryItem {
  kind: LibraryKind
  name: string
  slug?: string
}

export function useCreateLibraryItem(place: LibraryPlace) {
  const source = useDataSource()
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<NewLibraryItem>({
        success: (v) => (v.kind === 'module' ? 'Module created' : 'Custom node created'),
        error: SHOWN_INLINE,
      }),
    },
    mutationFn: (input: NewLibraryItem): Promise<ApiLibraryItem> =>
      source === 'api' ? libraryApi.createItem(place, input) : notYet(),
    onSuccess: () => invalidateLibrary(client, place),
  })
}

export function useUpdateLibraryItem(place: LibraryPlace) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: defineToast({ success: 'Saved', error: SHOWN_INLINE }) },
    mutationFn: (input: { id: string; name?: string; slug?: string; description?: string }) => {
      const { id, ...changes } = input
      return libraryApi.updateItem(id, changes)
    },
    onSuccess: (item) => invalidateLibrary(client, place, item.id),
  })
}

export function useDuplicateLibraryItem(place: LibraryPlace) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: defineToast({ success: 'Duplicated', error: SHOWN_INLINE }) },
    mutationFn: (input: { id: string; name: string; slug?: string }) =>
      libraryApi.duplicateItem(input.id, {
        name: input.name,
        ...(input.slug && { slug: input.slug }),
      }),
    onSuccess: () => invalidateLibrary(client, place),
  })
}

export function useDeleteLibraryItem(place: LibraryPlace) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: defineToast({ success: 'Deleted', error: SHOWN_INLINE }) },
    mutationFn: (id: string) => libraryApi.deleteItem(id),
    onSuccess: (_data, id) => invalidateLibrary(client, place, id),
  })
}

export function usePublishLibraryItem(place: LibraryPlace) {
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<string, ApiLibraryPublished>({
        success: (_id, published) =>
          published.pruned.length > 0
            ? `Published v${published.version}. Removed v${published.pruned.join(', v')}, the oldest kept`
            : `Published v${published.version}`,
        error: SHOWN_INLINE,
      }),
    },
    mutationFn: (id: string): Promise<ApiLibraryPublished> => libraryApi.publish(id),
    onSuccess: (_data, id) => invalidateLibrary(client, place, id),
  })
}

export function useRestoreLibraryVersion(place: LibraryPlace) {
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<{ id: string; version: string }, { version: string }>({
        success: (_input, restored) => `v${restored.version} is ready to edit`,
        error: SHOWN_INLINE,
      }),
    },
    mutationFn: (input: { id: string; version: string }) =>
      libraryApi.restore(input.id, input.version),
    onSuccess: (_data, input) => invalidateLibrary(client, place, input.id),
  })
}
