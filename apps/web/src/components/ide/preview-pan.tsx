import { useEffect, useRef } from 'react'
import { useNodesInitialized, useReactFlow, useStoreApi } from '@xyflow/react'
import { internalNodeRect, isRectVisible } from '../../lib/ide/viewport'

/**
 * Brings a node into view when it is not already, keeping the zoom. It moves
 * only when `nodeId` changes, never when the panel is resized or dragged, so
 * a graph the person has panned stays where they left it.
 */
export function PanToNode({ nodeId }: { nodeId: string | null }) {
  const initialized = useNodesInitialized()
  const flow = useReactFlow()
  const store = useStoreApi()
  // The effect reads these when it runs but must not re-run because they changed.
  const latest = useRef({ flow, store })
  latest.current = { flow, store }

  useEffect(() => {
    if (nodeId === null || !initialized) return
    const { flow: reactFlow, store: panelStore } = latest.current
    const rect = internalNodeRect(reactFlow.getInternalNode(nodeId))
    if (!rect) return
    const panel = panelStore.getState()
    if (panel.width === 0 || panel.height === 0) return
    const viewport = reactFlow.getViewport()
    if (isRectVisible(rect, viewport, panel)) return
    void reactFlow.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
      zoom: viewport.zoom,
      duration: 200,
    })
  }, [nodeId, initialized])

  return null
}
