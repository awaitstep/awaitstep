import {
  MutationCache,
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from '@tanstack/react-query'
import { mutationToastHandlers } from './action-toast'

export function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache(mutationToastHandlers),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: true,
        refetchIntervalInBackground: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient()
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}
