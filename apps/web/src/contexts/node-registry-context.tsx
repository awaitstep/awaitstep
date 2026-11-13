import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { NodeRegistry, bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'
import { useApiOrganizationId, useApiReady, useQueries } from './api-client-context'
import type { WorkflowCustomNode } from '../lib/api-client'

function createDefaultRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  for (const def of bundledNodeDefinitions) {
    registry.register(def)
  }
  return registry
}

/** Where a placed `custom:<itemId>` node comes from: its Library item and version. */
export type CustomNodeSource = Omit<WorkflowCustomNode, 'definition'>

interface NodeRegistryContextValue {
  registry: NodeRegistry
  /** The workflow's published custom nodes by node type; empty outside a workflow. */
  customNodes: ReadonlyMap<string, CustomNodeSource>
  /**
   * Whether the custom nodes are known: only once `ready` may a node missing
   * from the registry be called unavailable. `ready` outside a workflow.
   */
  customNodesStatus: CustomNodesStatus
  /** The workflow the registry was built for, when there is one. */
  workflowId?: string
  refresh: () => void
}

export type CustomNodesStatus = 'loading' | 'ready' | 'error'

const NO_CUSTOM_NODES: ReadonlyMap<string, CustomNodeSource> = new Map()
const NO_ENTRIES: WorkflowCustomNode[] = []

const NodeRegistryContext = createContext<NodeRegistryContextValue>({
  registry: createDefaultRegistry(),
  customNodes: NO_CUSTOM_NODES,
  customNodesStatus: 'ready',
  refresh: () => {},
})

interface NodeRegistryProviderProps {
  /** The workflow whose Library custom nodes join the registry. */
  workflowId?: string
  children: ReactNode
}

export function NodeRegistryProvider({ workflowId, children }: NodeRegistryProviderProps) {
  const [orgRegistry, setOrgRegistry] = useState(createDefaultRegistry)
  // A workflow URL's org, so its custom nodes show whichever org the switcher is on.
  const organizationId = useApiOrganizationId()
  const queries = useQueries()
  const ready = useApiReady()

  const fetchNodes = useCallback(() => {
    const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
    fetch(`/api/nodes${params}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((definitions: NodeDefinition[] | null) => {
        if (!definitions || definitions.length === 0) return

        const updated = createDefaultRegistry()
        for (const def of definitions) {
          updated.register(def)
        }
        setOrgRegistry(updated)
      })
      .catch(() => {
        // API unavailable — keep using bundled definitions
      })
  }, [organizationId])

  useEffect(() => {
    fetchNodes()
  }, [fetchNodes])

  // Nodes are installed on Resources › Nodes, in another tab: the palette
  // reads them again when the editor's tab comes back.
  useEffect(() => {
    window.addEventListener('focus', fetchNodes)
    return () => window.removeEventListener('focus', fetchNodes)
  }, [fetchNodes])

  // The workflow's Library nodes; the query refetches on focus too, so a
  // publish in the Library tab is in the palette on coming back.
  const customQuery = useQuery({
    ...queries.workflows.customNodes(workflowId ?? ''),
    enabled: ready && !!workflowId,
  })
  const entries = customQuery.data ?? NO_ENTRIES
  const { refetch } = customQuery
  // A failed refetch keeps the list it had; only a list never loaded is unknown.
  const customNodesStatus: CustomNodesStatus = !workflowId
    ? 'ready'
    : customQuery.data !== undefined
      ? 'ready'
      : customQuery.isError
        ? 'error'
        : 'loading'

  const registry = useMemo(() => {
    if (entries.length === 0) return orgRegistry
    const merged = new NodeRegistry()
    for (const def of orgRegistry.getAll()) merged.register(def)
    for (const entry of entries) merged.register(entry.definition)
    return merged
  }, [orgRegistry, entries])

  const customNodes = useMemo<ReadonlyMap<string, CustomNodeSource>>(
    () =>
      entries.length === 0
        ? NO_CUSTOM_NODES
        : new Map(entries.map(({ definition, ...source }) => [definition.id, source] as const)),
    [entries],
  )

  const refresh = useCallback(() => {
    fetchNodes()
    if (workflowId) void refetch()
  }, [fetchNodes, refetch, workflowId])

  const value = useMemo(
    () => ({
      registry,
      customNodes,
      customNodesStatus,
      refresh,
      ...(workflowId && { workflowId }),
    }),
    [registry, customNodes, customNodesStatus, refresh, workflowId],
  )

  return <NodeRegistryContext.Provider value={value}>{children}</NodeRegistryContext.Provider>
}

export function useNodeRegistry(): NodeRegistryContextValue {
  return useContext(NodeRegistryContext)
}
