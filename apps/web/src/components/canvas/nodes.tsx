import type { NodeProps } from '@xyflow/react'
import {
  Code,
  Clock,
  CalendarClock,
  GitBranch,
  Layers,
  Globe,
  Bell,
} from 'lucide-react'
import { NodeBase } from './node-base'
import type { FlowNode } from '../../stores/workflow-store'
import { getNodeVisuals } from '../../lib/node-icon-map'

export function StepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'step') return null
  return (
    <NodeBase label={node.name} icon={<Code className="h-2.5 w-2.5" />} accent="bg-blue-500/15 text-blue-400" selected={selected} />
  )
}

export function SleepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sleep') return null
  return (
    <NodeBase label={node.name} icon={<Clock className="h-2.5 w-2.5" />} accent="bg-amber-500/15 text-amber-400" selected={selected}>
      {String(node.duration)}
    </NodeBase>
  )
}

export function SleepUntilNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sleep-until') return null
  return (
    <NodeBase label={node.name} icon={<CalendarClock className="h-2.5 w-2.5" />} accent="bg-amber-500/15 text-amber-400" selected={selected}>
      {node.timestamp}
    </NodeBase>
  )
}

export function BranchNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'branch') return null
  return (
    <NodeBase label={node.name} icon={<GitBranch className="h-2.5 w-2.5" />} accent="bg-purple-500/15 text-purple-400" selected={selected}>
      <span className="font-mono">{node.branches.length} branch{node.branches.length !== 1 ? 'es' : ''}</span>
    </NodeBase>
  )
}

export function ParallelNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'parallel') return null
  return (
    <NodeBase label={node.name} icon={<Layers className="h-2.5 w-2.5" />} accent="bg-teal-500/15 text-teal-400" selected={selected} />
  )
}

export function HttpRequestNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'http-request') return null
  return (
    <NodeBase label={node.name} icon={<Globe className="h-2.5 w-2.5" />} accent="bg-green-500/15 text-green-400" selected={selected}>
      <span className="font-mono">{node.method} {node.url}</span>
    </NodeBase>
  )
}

export function WaitForEventNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'wait-for-event') return null
  return (
    <NodeBase label={node.name} icon={<Bell className="h-2.5 w-2.5" />} accent="bg-rose-500/15 text-rose-400" selected={selected}>
      {node.eventType}{node.timeout ? ` (${node.timeout})` : ''}
    </NodeBase>
  )
}

export function CustomNodeComponent({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'custom') return null
  const visuals = getNodeVisuals(node.nodeId)
  return (
    <NodeBase label={node.name} icon={visuals.icon} accent={visuals.accent} selected={selected}>
      {node.nodeId}
    </NodeBase>
  )
}

export const nodeTypes = {
  'step': StepNode,
  'sleep': SleepNode,
  'sleep-until': SleepUntilNode,
  'branch': BranchNode,
  'parallel': ParallelNode,
  'http-request': HttpRequestNode,
  'wait-for-event': WaitForEventNode,
  'custom': CustomNodeComponent,
}
