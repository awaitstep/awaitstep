import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NodeRegistry, bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'
import { useApiOrganizationId } from './api-client-context'

function createDefaultRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  for (const def of bundledNodeDefinitions) {
    registry.register(def)
  }
  return registry
}

interface NodeRegistryContextValue {
  registry: NodeRegistry
  refresh: () => void
}

const NodeRegistryContext = createContext<NodeRegistryContextValue>({
  registry: createDefaultRegistry(),
  refresh: () => {},
})

export function NodeRegistryProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState(createDefaultRegistry)
  // A workflow URL's org, so its custom nodes show whichever org the switcher is on.
  const organizationId = useApiOrganizationId()

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
        setRegistry(updated)
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

  return (
    <NodeRegistryContext.Provider value={{ registry, refresh: fetchNodes }}>
      {children}
    </NodeRegistryContext.Provider>
  )
}

export function useNodeRegistry(): NodeRegistryContextValue {
  return useContext(NodeRegistryContext)
}
