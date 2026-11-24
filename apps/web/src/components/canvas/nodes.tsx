import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeBase } from './node-base'
import type { FlowNode } from '../../stores/workflow-store'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { isCustomNodeType } from '../../lib/node-categories'
import type { BranchCondition } from '@awaitstep/ir'

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'step') return null
  return <NodeBase label={node.name} nodeType={node.type} selected={selected} />
})

export const SleepNode = memo(function SleepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sleep') return null
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
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
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      {String(node.data.timestamp ?? '')}
    </NodeBase>
  )
})

export const BranchNode = memo(function BranchNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'branch') return null
  const branches = (node.data.branches ?? []) as BranchCondition[]
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      <span className="font-mono">
        {branches.length} branch{branches.length !== 1 ? 'es' : ''}
      </span>
    </NodeBase>
  )
})

export const ParallelNode = memo(function ParallelNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'parallel') return null
  return <NodeBase label={node.name} nodeType={node.type} selected={selected} />
})

export const HttpRequestNode = memo(function HttpRequestNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'http_request') return null
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
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
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      {String(node.data.eventType ?? '')}
      {node.data.timeout ? ` (${node.data.timeout})` : ''}
    </NodeBase>
  )
})

export const TryCatchNode = memo(function TryCatchNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'try_catch') return null
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      <span className="font-mono">try / catch</span>
    </NodeBase>
  )
})

export const LoopNode = memo(function LoopNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'loop') return null
  const loopType = String(node.data.loopType ?? 'forEach')
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      <span className="font-mono">{loopType}</span>
    </NodeBase>
  )
})

export const BreakNode = memo(function BreakNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'break') return null
  const condition = String(node.data.condition ?? '')
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
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
  const workflowLabel = String(node.data.workflowName ?? node.data.workflowId ?? '')
  const wait = node.data.waitForCompletion !== false
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      {workflowLabel && (
        <span className="font-mono">
          {workflowLabel}
          {wait ? '' : ' (fire & forget)'}
        </span>
      )}
    </NodeBase>
  )
})

export const SubScriptNode = memo(function SubScriptNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'sub_script') return null
  const scriptName = String(node.data.scriptId ?? node.data.workerName ?? '')
  const method = String(node.data.method ?? 'POST')
  return (
    <NodeBase label={node.name} nodeType={node.type} selected={selected}>
      {scriptName && (
        <span className="font-mono">
          {method} → {scriptName}
        </span>
      )}
    </NodeBase>
  )
})

export const RaceNode = memo(function RaceNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.irNode
  if (node.type !== 'race') return null
  return <NodeBase label={node.name} nodeType={node.type} selected={selected} />
})

export const CustomNodeComponent = memo(function CustomNodeComponent({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const node = data.irNode
  const { registry, customNodesStatus } = useNodeRegistry()
  const def = registry.get(node.type)
  // A Library node reads as one; its `custom:<id>` type means nothing to a person.
  const library = isCustomNodeType(node.type)
  // Not in the registry: a Library node only counts as missing once its list is known.
  const isMissing = !def && (!library || customNodesStatus === 'ready')
  const kind = isMissing ? 'Unavailable' : library ? 'Custom node' : undefined
  const chip = library ? `v${node.version}` : undefined
  return (
    <NodeBase
      label={node.name}
      nodeType={node.type}
      kind={kind}
      chip={chip}
      selected={selected}
      warning={isMissing}
    />
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
  sub_script: SubScriptNode,
  race: RaceNode,
  custom: CustomNodeComponent,
}
