import { useCallback } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Info, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { CodeEditor } from '../ui/code-editor'
import { Select } from '../ui/select'
import { DynamicFields } from './dynamic-fields'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789_', 12)
import type { WorkflowNode, BranchCondition } from '@awaitstep/ir'

const NESTED_STEP_PATTERN = /step\.(do|sleep|sleepUntil|waitForEvent)\s*\(/

export function validateNode(node: WorkflowNode): string[] {
  const errors: string[] = []
  if (!node.name.trim()) errors.push('Step name is required')

  switch (node.type) {
    case 'step': {
      const code = String(node.data.code ?? '')
      if (!code.trim()) errors.push('Step code cannot be empty')
      if (NESTED_STEP_PATTERN.test(code)) errors.push('Nested step calls are not allowed')
      break
    }
    case 'sleep': {
      const raw = String(node.data.duration ?? '').trim()
      if (!raw) errors.push('Duration is required')
      break
    }
    case 'sleep_until': {
      const ts = String(node.data.timestamp ?? '').trim()
      if (!ts) errors.push('Timestamp is required')
      else if (isNaN(Date.parse(ts))) errors.push('Timestamp is not a valid date')
      break
    }
    case 'http_request':
      if (!String(node.data.url ?? '').trim()) errors.push('URL is required')
      break
    case 'wait_for_event': {
      const et = String(node.data.eventType ?? '').trim()
      if (!et) errors.push('Event type is required')
      else if (!/^[a-zA-Z0-9_-]+$/.test(et)) errors.push('Event type contains invalid characters')
      break
    }
    case 'branch': {
      const branches = (node.data.branches ?? []) as BranchCondition[]
      if (branches.length < 2) errors.push('At least 2 branches are required')
      break
    }
  }
  return errors
}

export function NodeConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const registry = useNodeRegistry()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const irNode = selectedNode?.data.irNode ?? null

  const tryClose = useCallback(() => {
    if (!irNode) return
    const errors = validateNode(irNode)
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    selectNode(null)
  }, [irNode, selectNode])

  if (!selectedNode || !irNode) return null

  const definition = registry.get(irNode.type)

  const updateData = (fieldId: string, value: unknown) => {
    updateNodeData(selectedNode.id, {
      data: { ...irNode.data, [fieldId]: value },
    })
  }

  const update = (data: Partial<WorkflowNode>) => {
    updateNodeData(selectedNode.id, data)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <span className="text-[13px] font-semibold text-foreground">Edit Node</span>
          <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">
            {definition?.name ?? irNode.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeNode(selectedNode.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={tryClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        <div className="space-y-4">
          <Field label="Node Name" hint="Max 256 characters">
            <Input value={irNode.name} onChange={(e) => update({ name: e.target.value.slice(0, 256) })} debounceMs={300} placeholder="My node" maxLength={256} />
          </Field>

          <Separator className="!bg-muted/60" />

          {irNode.type === 'branch' ? (
            <BranchFields node={irNode} onUpdate={update} />
          ) : irNode.type === 'parallel' ? (
            <Hint>Connect multiple nodes from this output to run them concurrently via Promise.all(). Not natively durable — use separate Workflow instances for durable parallelism.</Hint>
          ) : definition ? (
            <DynamicFields
              configSchema={definition.configSchema}
              data={irNode.data}
              onChange={updateData}
            />
          ) : (
            <Hint>Unknown node type: <strong>{irNode.type}</strong></Hint>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <span className="text-[10px] text-muted-foreground/40">ID: {selectedNode.id}</span>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground/40">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/60">
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
      <span>{children}</span>
    </div>
  )
}

// ── Branch (if/else if/else) — kept as custom component for edge management ──

function BranchFields({ node, onUpdate }: { node: WorkflowNode; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const allNodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)

  const branches = (node.data.branches ?? []) as BranchCondition[]
  const outgoingEdges = edges.filter((e) => e.source === selectedNodeId)

  const targetOptions = allNodes
    .filter((n) => n.id !== selectedNodeId)
    .map((n) => ({ value: n.id, label: n.data.irNode.name }))

  const getTargetForLabel = (label: string) => {
    const edge = outgoingEdges.find((e) => e.label === label)
    return edge?.target ?? ''
  }

  const setTargetForBranch = (label: string, targetId: string) => {
    const store = useWorkflowStore.getState()
    const existingEdge = outgoingEdges.find((e) => e.label === label)

    if (targetId === '') {
      if (existingEdge) {
        useWorkflowStore.setState({ edges: store.edges.filter((e) => e.id !== existingEdge.id) })
      }
      return
    }

    if (existingEdge) {
      useWorkflowStore.setState({ edges: store.edges.map((e) => e.id === existingEdge.id ? { ...e, target: targetId } : e) })
    } else {
      useWorkflowStore.setState({ edges: [...store.edges, { id: nanoid(), source: selectedNodeId!, target: targetId, label }] })
    }
  }

  const updateBranch = (index: number, field: 'label' | 'condition', value: string) => {
    if (field === 'label') {
      const oldLabel = branches[index]!.label
      const store = useWorkflowStore.getState()
      useWorkflowStore.setState({
        edges: store.edges.map((e) =>
          e.source === selectedNodeId && e.label === oldLabel ? { ...e, label: value } : e,
        ),
      })
    }
    const updated = branches.map((b, i) => i === index ? { ...b, [field]: value } : b)
    onUpdate({ data: { ...node.data, branches: updated } })
  }

  const addBranch = () => {
    const existingLabels = new Set(branches.map((b) => b.label))
    let label = 'branch'
    let i = 1
    while (existingLabels.has(label)) {
      label = `branch-${i++}`
    }
    const updated = [...branches]
    const lastBranch = updated[updated.length - 1]
    if (lastBranch && lastBranch.condition === '') {
      updated.splice(updated.length - 1, 0, { label, condition: 'true' })
    } else {
      updated.push({ label, condition: 'true' })
    }
    onUpdate({ data: { ...node.data, branches: updated } })
  }

  const removeBranch = (index: number) => {
    if (branches.length <= 1) return
    const label = branches[index]!.label
    const edge = outgoingEdges.find((e) => e.label === label)
    if (edge) {
      const store = useWorkflowStore.getState()
      useWorkflowStore.setState({ edges: store.edges.filter((e) => e.id !== edge.id) })
    }
    onUpdate({ data: { ...node.data, branches: branches.filter((_, i) => i !== index) } })
  }

  return (
    <>
      <div className="space-y-2">
        {branches.map((branch, index) => (
          <BranchCard
            key={index}
            branch={branch}
            index={index}
            isLast={index === branches.length - 1}
            branchCount={branches.length}
            currentTarget={getTargetForLabel(branch.label)}
            targetOptions={targetOptions}
            onUpdateLabel={(v) => updateBranch(index, 'label', v)}
            onUpdateCondition={(v) => updateBranch(index, 'condition', v)}
            onSetTarget={(v) => setTargetForBranch(branch.label, v === '__none__' ? '' : v)}
            onRemove={() => removeBranch(index)}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={addBranch}>
        <Plus className="h-3 w-3" />
        <span>Add condition</span>
      </Button>

      <Hint>
        Select which node each branch should go to. Edges are created automatically.
      </Hint>
    </>
  )
}

function BranchCard({
  branch,
  index,
  isLast,
  branchCount,
  currentTarget,
  targetOptions,
  onUpdateLabel,
  onUpdateCondition,
  onSetTarget,
  onRemove,
}: {
  branch: BranchCondition
  index: number
  isLast: boolean
  branchCount: number
  currentTarget: string
  targetOptions: { value: string; label: string }[]
  onUpdateLabel: (value: string) => void
  onUpdateCondition: (value: string) => void
  onSetTarget: (value: string) => void
  onRemove: () => void
}) {
  const isElse = branch.condition === '' && isLast
  const heading = index === 0 ? 'When this is true' : isElse ? 'Otherwise (default)' : 'Otherwise, when this is true'

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">{heading}</span>
        {branchCount > 1 && (
          <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground/40 hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground/60">Label</Label>
          <Input
            value={branch.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            debounceMs={300}
            placeholder="e.g. approved, rejected"
            className="h-8 text-[11px]"
          />
        </div>

        {!isElse && (
          <CodeEditor
            value={branch.condition}
            onChange={onUpdateCondition}
            debounceMs={300}
            language="javascript"
            height="40px"
          />
        )}

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground/60">Go to</Label>
          <Select
            value={currentTarget || '__none__'}
            onValueChange={onSetTarget}
            options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
            className="h-8 text-[11px]"
          />
        </div>
      </div>
    </div>
  )
}
