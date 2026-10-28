import type { QueryKey } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { ApiError } from '../../lib/api-client'
import { withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/**
 * Where the dashboard's hooks read from: the real API, or the dummy server.
 * The app runs on the API unless the URL asks for a dummy scenario (`?mock=`,
 * `?as=`); tests and stories render against the dummy server, which is the
 * default here.
 */
export type DataSource = 'mock' | 'api'

const DataSourceContext = createContext<DataSource>('mock')

export function DataSourceProvider({
  source,
  children,
}: {
  source: DataSource
  children: ReactNode
}) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>
}

export function useDataSource(): DataSource {
  return useContext(DataSourceContext)
}

/**
 * The query key for a dashboard read: the API's keys stand apart from the
 * dummy server's, so switching sources never serves the other's cache.
 */
export function useDashKey(): (key: QueryKey) => QueryKey {
  const source = useDataSource()
  const ctx = useMockContext()
  return (key) => (source === 'api' ? [...key, 'api'] : withMockContext(key, ctx))
}

/** A write whose backend step has not landed: the same refusal the dummy server gives. */
export function notYet(): Promise<never> {
  return Promise.reject(new ApiError('This isn’t connected to the API yet', 501))
}
