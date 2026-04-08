import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const hovered = data?.hovered === true
  const highlighted = data?.selected === true || hovered
  const containerColor = (data?.containerColor as string) ?? undefined

  const edgeStyle = highlighted
    ? { ...style, stroke: 'oklch(0.696 0.17 162.48)', strokeWidth: 2.5 }
    : containerColor
      ? { ...style, stroke: containerColor, strokeWidth: 1.5 }
      : style

  const labelColor = highlighted ? 'oklch(0.696 0.17 162.48)' : (containerColor ?? undefined)

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-card px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground border border-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...(labelColor
                ? {
                    color: labelColor,
                    borderColor: labelColor.replace(')', ' / 0.4)'),
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
