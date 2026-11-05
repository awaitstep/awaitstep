import { useCallback, useMemo, useState } from 'react'
import type { Node, NodeChange } from '@xyflow/react'

type Sizes = Readonly<Record<string, { width: number; height: number }>>

/**
 * For a React Flow whose nodes the app does not own: it measures nodes but
 * only the app can store the result, and React Flow forgets a node's size
 * whenever the node object it was given changes. Without this, a graph that
 * is never dragged is never "initialized" (so nothing that waits for that,
 * such as fit-to-view, ever runs) and every rebuilt node vanishes until it
 * is measured again.
 *
 * Pass the returned `onNodesChange` to the flow and render the returned
 * nodes. Nodes it has not heard of are returned as they came.
 */
export function useMeasuredNodes<T extends Node>(nodes: readonly T[]) {
  const [sizes, setSizes] = useState<Sizes>({})

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setSizes((prev) => {
      let next: Record<string, { width: number; height: number }> | null = null
      for (const change of changes) {
        if (change.type !== 'dimensions' || !change.dimensions) continue
        const { width, height } = change.dimensions
        const known = (next ?? prev)[change.id]
        if (known && known.width === width && known.height === height) continue
        next ??= { ...prev }
        next[change.id] = { width, height }
      }
      return next ?? prev
    })
  }, [])

  const measured = useMemo(
    () =>
      nodes.map((node) => {
        const size = sizes[node.id]
        if (!size) return node
        if (node.measured?.width === size.width && node.measured?.height === size.height) {
          return node
        }
        return { ...node, measured: size }
      }),
    [nodes, sizes],
  )

  return { nodes: measured, onNodesChange }
}
