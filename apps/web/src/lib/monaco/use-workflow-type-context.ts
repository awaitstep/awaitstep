import { useEffect, useMemo } from 'react'
import { useMonaco } from '@monaco-editor/react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { buildWorkflowContextDts, setWorkflowTypeContext } from './context-dts'

/**
 * Keeps Monaco's per-workflow ambient types in sync with the canvas: typed
 * Env, one typed const per node output, runGraph for scripts. Mount once
 * wherever editors live; pushing into Monaco is a genuine external side
 * effect, and setWorkflowTypeContext deduplicates by content.
 */
export function useWorkflowTypeContext(): void {
  const monaco = useMonaco()
  const { kind, workflowEnvVars, runtimeBindings } = useWorkflowStore(
    useShallow((s) => ({
      kind: s.kind,
      workflowEnvVars: s.workflowEnvVars,
      runtimeBindings: s.runtimeBindings,
    })),
  )
  // Project down to the IR nodes: canvas drags replace the flow-node objects
  // but keep each irNode reference, so position-only updates shallow-compare
  // equal here and never rebuild the d.ts.
  const irNodes = useWorkflowStore(useShallow((s) => s.nodes.map((n) => n.data.irNode)))
  const { registry } = useNodeRegistry()

  const dts = useMemo(
    () =>
      buildWorkflowContextDts({
        kind: kind === 'script' ? 'script' : 'workflow',
        nodes: irNodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
        envVarNames: workflowEnvVars.map((v) => v.name),
        bindings: runtimeBindings,
        resolveDefinition: (nodeType) => registry.get(nodeType),
      }),
    [kind, irNodes, workflowEnvVars, runtimeBindings, registry],
  )

  useEffect(() => {
    if (monaco) setWorkflowTypeContext(monaco, dts)
  }, [monaco, dts])
}
