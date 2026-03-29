import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import {
  Code,
  Clock,
  CalendarClock,
  GitBranch,
  Layers,
  Globe,
  Bell,
  ShieldAlert,
  Repeat,
  CircleStop,
  Workflow,
  Zap,
} from 'lucide-react'
import { NodeBase } from './node-base'
import type { FlowNode } from '../../stores/workflow-store'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import type { BranchCondition } from '@awaitstep/ir'

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'step') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Code className="h-2.5 w-2.5" />}
      accent="bg-blue-500/15 text-blue-400"
      selected={selected}
    />
  )
})

export const SleepNode = memo(function SleepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sleep') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Clock className="h-2.5 w-2.5" />}
      accent="bg-amber-500/15 text-amber-400"
      selected={selected}
    >
      {String(node.data.duration ?? '')}
    </NodeBase>
  )
})

export const SleepUntilNode = memo(function SleepUntilNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sleep_until') return null
  return (
    <NodeBase
      label={node.name}
      icon={<CalendarClock className="h-2.5 w-2.5" />}
      accent="bg-amber-500/15 text-amber-400"
      selected={selected}
    >
      {String(node.data.timestamp ?? '')}
    </NodeBase>
  )
})

export const BranchNode = memo(function BranchNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'branch') return null
  const branches = (node.data.branches ?? []) as BranchCondition[]
  return (
    <NodeBase
      label={node.name}
      icon={<GitBranch className="h-2.5 w-2.5" />}
      accent="bg-purple-500/15 text-purple-400"
      selected={selected}
    >
      <span className="font-mono">
        {branches.length} branch{branches.length !== 1 ? 'es' : ''}
      </span>
    </NodeBase>
  )
})

export const ParallelNode = memo(function ParallelNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'parallel') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Layers className="h-2.5 w-2.5" />}
      accent="bg-teal-500/15 text-teal-400"
      selected={selected}
    />
  )
})

export const HttpRequestNode = memo(function HttpRequestNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'http_request') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Globe className="h-2.5 w-2.5" />}
      accent="bg-green-500/15 text-green-400"
      selected={selected}
    >
      <span className="font-mono">
        {String(node.data.method ?? '')} {String(node.data.url ?? '')}
      </span>
    </NodeBase>
  )
})

export const WaitForEventNode = memo(function WaitForEventNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'wait_for_event') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Bell className="h-2.5 w-2.5" />}
      accent="bg-rose-500/15 text-rose-400"
      selected={selected}
    >
      {String(node.data.eventType ?? '')}
      {node.data.timeout ? ` (${node.data.timeout})` : ''}
    </NodeBase>
  )
})

export const TryCatchNode = memo(function TryCatchNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'try_catch') return null
  return (
    <NodeBase
      label={node.name}
      icon={<ShieldAlert className="h-2.5 w-2.5" />}
      accent="bg-orange-500/15 text-orange-400"
      selected={selected}
    >
      <span className="font-mono">try / catch</span>
    </NodeBase>
  )
})

export const LoopNode = memo(function LoopNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'loop') return null
  const loopType = String(node.data.loopType ?? 'forEach')
  return (
    <NodeBase
      label={node.name}
      icon={<Repeat className="h-2.5 w-2.5" />}
      accent="bg-cyan-500/15 text-cyan-400"
      selected={selected}
    >
      <span className="font-mono">{loopType}</span>
    </NodeBase>
  )
})

export const BreakNode = memo(function BreakNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'break') return null
  const condition = String(node.data.condition ?? '')
  return (
    <NodeBase
      label={node.name}
      icon={<CircleStop className="h-2.5 w-2.5" />}
      accent="bg-red-500/15 text-red-400"
      selected={selected}
    >
      {condition ? <span className="font-mono">{condition}</span> : null}
    </NodeBase>
  )
})

export const SubWorkflowNode = memo(function SubWorkflowNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sub_workflow') return null
  const workflowName = String(node.data.workflowName ?? '')
  const wait = node.data.waitForCompletion !== false
  return (
    <NodeBase
      label={node.name}
      icon={<Workflow className="h-2.5 w-2.5" />}
      accent="bg-violet-500/15 text-violet-400"
      selected={selected}
    >
      {workflowName && (
        <span className="font-mono">
          {workflowName}
          {wait ? '' : ' (fire & forget)'}
        </span>
      )}
    </NodeBase>
  )
})

export const RaceNode = memo(function RaceNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'race') return null
  return (
    <NodeBase
      label={node.name}
      icon={<Zap className="h-2.5 w-2.5" />}
      accent="bg-yellow-500/15 text-yellow-400"
      selected={selected}
    />
  )
})

export const CustomNodeComponent = memo(function CustomNodeComponent({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  const { registry } = useNodeRegistry()
  const def = registry.get(node.type)
  const isMissing = !def
  const visuals = getNodeVisuals(node.type, def?.icon)
  return (
    <NodeBase
      label={node.name}
      icon={visuals.icon}
      accent={visuals.accent}
      selected={selected}
      warning={isMissing}
    >
      {node.type}
    </NodeBase>
  )
})

export const nodeTypes = {
  step: StepNode,
  sleep: SleepNode,
  sleep_until: SleepUntilNode,
  branch: BranchNode,
  parallel: ParallelNode,
  http_request: HttpRequestNode,
  wait_for_event: WaitForEventNode,
  try_catch: TryCatchNode,
  loop: LoopNode,
  break: BreakNode,
  sub_workflow: SubWorkflowNode,
  race: RaceNode,
  custom: CustomNodeComponent,
}
