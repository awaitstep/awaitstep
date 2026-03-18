import { createContext, useContext, type ReactNode } from 'react'
import { NodeRegistry, bundledNodeDefinitions } from '@awaitstep/ir'

const registry = new NodeRegistry()
for (const def of bundledNodeDefinitions) {
  registry.register(def)
}

const NodeRegistryContext = createContext<NodeRegistry>(registry)

export function NodeRegistryProvider({ children }: { children: ReactNode }) {
  return (
    <NodeRegistryContext.Provider value={registry}>
      {children}
    </NodeRegistryContext.Provider>
  )
}

export function useNodeRegistry(): NodeRegistry {
  return useContext(NodeRegistryContext)
}
