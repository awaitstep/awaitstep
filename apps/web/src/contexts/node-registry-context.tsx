import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { NodeRegistry, bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeDefinition } from '@awaitstep/ir'

function createDefaultRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  for (const def of bundledNodeDefinitions) {
    registry.register(def)
  }
  return registry
}

const NodeRegistryContext = createContext<NodeRegistry>(createDefaultRegistry())

export function NodeRegistryProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState(createDefaultRegistry)

  useEffect(() => {
    fetch('/api/nodes', { credentials: 'include' })
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
  }, [])

  return (
    <NodeRegistryContext.Provider value={registry}>
      {children}
    </NodeRegistryContext.Provider>
  )
}

export function useNodeRegistry(): NodeRegistry {
  return useContext(NodeRegistryContext)
}
