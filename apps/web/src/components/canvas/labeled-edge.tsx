import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
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
  const highlighted = selected || hovered

  const edgeStyle = highlighted
    ? { ...style, stroke: 'oklch(0.696 0.17 162.48)', strokeWidth: 2.5 }
    : style

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-card px-1 py-0.5 font-mono text-[8px] leading-none text-muted-foreground border border-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...(highlighted ? { color: 'oklch(0.696 0.17 162.48)', borderColor: 'oklch(0.696 0.17 162.48 / 0.4)' } : {}),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
