import { useMemo } from 'react'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { filterNodes, paletteGroups } from '../../lib/node-categories'
import { useWorkflowStore } from '../../stores/workflow-store'

// Nodes that require a durable runtime (sleeps, waiting on external events).
// Functions run in a fetch handler with no step runner, so these are filtered
// out — kept in sync with `validateScript` in @awaitstep/ir.
const SCRIPT_INCOMPATIBLE_NODE_TYPES = new Set<string>(['sleep', 'sleep_until', 'wait_for_event'])

export const BUILTIN_IDS = new Set([
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
  'try_catch',
  'loop',
  'break',
  'sub_workflow',
  'sub_script',
  'race',
])

/** The nodes this workflow may add, matching `search`, in the palette's groups. */
export function usePaletteGroups(search: string) {
  const { registry, customNodes } = useNodeRegistry()
  const definitions = registry.getAll()
  const kind = useWorkflowStore((s) => s.kind)
  const groups = useMemo(() => {
    const compatible =
      kind === 'script'
        ? definitions.filter((d) => !SCRIPT_INCOMPATIBLE_NODE_TYPES.has(d.id))
        : definitions
    return paletteGroups(search ? filterNodes(compatible, search) : compatible)
  }, [definitions, search, kind])
  return { groups, customNodes }
}
