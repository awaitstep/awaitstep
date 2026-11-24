import { memo } from 'react'
import { EDGE_HIGHLIGHT_COLOR } from '../../lib/canvas/edge-flow'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export const LabeledEdge = memo(function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const hovered = data?.hovered === true
  const highlighted = data?.selected === true || hovered
  const containerColor = typeof data?.containerColor === 'string' ? data.containerColor : undefined

  const edgeStyle = highlighted
    ? { ...style, stroke: EDGE_HIGHLIGHT_COLOR, strokeWidth: 2.5 }
    : containerColor
      ? { ...style, stroke: containerColor, strokeWidth: 1.5 }
      : style

  const labelColor = highlighted ? EDGE_HIGHLIGHT_COLOR : (containerColor ?? undefined)

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-card px-1 py-0.5 font-mono text-2xs leading-none text-muted-foreground border border-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...(labelColor
                ? {
                    color: labelColor,
                    borderColor: `color-mix(in oklch, ${labelColor} 40%, transparent)`,
                  }
                : {}),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
