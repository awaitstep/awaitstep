import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NodeRegistry, bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'
import { useOrgStore } from '../stores/org-store'

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
  const organizationId = useOrgStore((s) => s.activeOrganizationId)

  const fetchNodes = useCallback(() => {
    const params = organizationId ? `?organizationId=${organizationId}` : ''
    fetch(`/api/nodes${params}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((definitions: NodeDefinition[] | null) => {
        if (!definitions || definitions.length === 0) return

        const updated = new NodeRegistry()
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

  return (
    <NodeRegistryContext.Provider value={{ registry, refresh: fetchNodes }}>
      {children}
    </NodeRegistryContext.Provider>
  )
}

export function useNodeRegistry(): NodeRegistryContextValue {
  return useContext(NodeRegistryContext)
}
