import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Info, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { CodeEditor } from '../ui/code-editor'
import { Select } from '../ui/select'
import { DynamicFields } from './dynamic-fields'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { cn } from '../../lib/utils'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
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
      if (branches.length < 1) errors.push('At least 1 branch is required')
      break
    }
    case 'loop': {
      const loopType = String(node.data.loopType ?? '')
      if (!['forEach', 'while', 'times'].includes(loopType)) errors.push('Loop type is required')
      if (loopType === 'forEach' && !String(node.data.collection ?? '').trim())
        errors.push('Collection expression is required for forEach loops')
      if (loopType === 'times') {
        const count = Number(node.data.count ?? 0)
        if (count < 1) errors.push('Count must be at least 1')
      }
      break
    }
    case 'sub_workflow':
      if (!String(node.data.workflowId ?? '').trim()) errors.push('Script name is required')
      if (!String(node.data.workflowName ?? '').trim()) errors.push('Workflow name is required')
      break
  }
  return errors
}

export function NodeConfigPanel() {
  const { selectedNodeId, nodes } = useWorkflowStore(
    useShallow((s) => ({ selectedNodeId: s.selectedNodeId, nodes: s.nodes })),
  )
  const { updateNodeData, removeNode, selectNode } = useWorkflowStore()
  const { registry } = useNodeRegistry()

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
  const visuals = getNodeVisuals(irNode.type, definition?.icon)

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
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              visuals.accent,
            )}
          >
            {visuals.paletteIcon}
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">Edit Node</span>
            <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground/60">
              {definition?.name ?? irNode.type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => removeNode(selectedNode.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={tryClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        <div className="space-y-4">
          <Field label="Node Name" hint="Max 256 characters">
            <Input
              value={irNode.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 256) })}
              debounceMs={300}
              placeholder="My node"
              maxLength={256}
            />
          </Field>

          <Separator className="!bg-muted/60" />

          {irNode.type === 'branch' ? (
            <BranchFields node={irNode} onUpdate={update} />
          ) : irNode.type === 'parallel' ? (
            <ForkFields
              hint="Connect multiple nodes from this output to run them concurrently via Promise.all().
                Not natively durable — use separate Workflow instances for durable parallelism."
            />
          ) : irNode.type === 'race' ? (
            <ForkFields
              hint="Connect multiple nodes — they run concurrently via Promise.race(). The first to
                complete wins; remaining branches are abandoned."
            />
          ) : irNode.type === 'try_catch' ? (
            <TryCatchFields />
          ) : irNode.type === 'loop' ? (
            <LoopFields node={irNode} onUpdate={update} />
          ) : irNode.type === 'break' ? (
            <>
              <Field label="Condition" hint="Leave empty for unconditional">
                <Input
                  value={String(irNode.data.condition ?? '')}
                  onChange={(e) => updateData('condition', e.target.value)}
                  debounceMs={300}
                  placeholder='poll_result.status === "complete"'
                  className="font-mono text-xs"
                />
              </Field>
              <Hint>
                Inside a loop: exits the loop (break). Outside a loop: stops workflow execution
                (return). Leave the condition empty for unconditional exit.
              </Hint>
            </>
          ) : definition ? (
            <DynamicFields
              configSchema={definition.configSchema}
              data={irNode.data}
              onChange={updateData}
            />
          ) : (
            <div className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Unknown node type: <strong>{irNode.type}</strong>. This node&apos;s definition was
                not found in the registry — it may have been removed or not installed.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground/40">ID: {selectedNode.id}</span>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground/40">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground/60">
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
      <span>{children}</span>
    </div>
  )
}

// ── Shared hook for edge-management sub-components ──
// Subscribes to edges + a stable node-names map instead of the full nodes array,
// so position drags don't trigger re-renders in config panel sub-components.

function useEdgeManagement() {
  const { selectedNodeId, edges, nodes } = useWorkflowStore(
    useShallow((s) => ({ selectedNodeId: s.selectedNodeId, edges: s.edges, nodes: s.nodes })),
  )

  const outgoingEdges = useMemo(
    () => edges.filter((e) => e.source === selectedNodeId),
    [edges, selectedNodeId],
  )

  const targetOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    for (const n of nodes) {
      if (n.id !== selectedNodeId) opts.push({ value: n.id, label: n.data.irNode.name })
    }
    return opts
  }, [nodes, selectedNodeId])

  const getTargetForLabel = useCallback(
    (label: string) => outgoingEdges.find((e) => e.label === label)?.target ?? '',
    [outgoingEdges],
  )

  const setTargetForLabel = useCallback(
    (label: string, targetId: string) => {
      const store = useWorkflowStore.getState()
      const existingEdge = store.edges.find((e) => e.source === selectedNodeId && e.label === label)

      if (targetId === '') {
        if (existingEdge) {
          useWorkflowStore.setState({
            edges: store.edges.filter((e) => e.id !== existingEdge.id),
            isDirty: true,
          })
        }
        return
      }

      if (existingEdge) {
        useWorkflowStore.setState({
          edges: store.edges.map((e) =>
            e.id === existingEdge.id ? { ...e, target: targetId } : e,
          ),
          isDirty: true,
        })
      } else {
        useWorkflowStore.setState({
          edges: [
            ...store.edges,
            { id: nanoid(), source: selectedNodeId!, target: targetId, label },
          ],
          isDirty: true,
        })
      }
    },
    [selectedNodeId],
  )

  return { selectedNodeId, outgoingEdges, targetOptions, getTargetForLabel, setTargetForLabel }
}

// ── Branch (if/else if/else) — kept as custom component for edge management ──

function BranchFields({
  node,
  onUpdate,
}: {
  node: WorkflowNode
  onUpdate: (d: Partial<WorkflowNode>) => void
}) {
  const {
    nodes: allNodes,
    edges,
    selectedNodeId,
  } = useWorkflowStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges, selectedNodeId: s.selectedNodeId })),
  )

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
      useWorkflowStore.setState({
        edges: store.edges.map((e) => (e.id === existingEdge.id ? { ...e, target: targetId } : e)),
      })
    } else {
      useWorkflowStore.setState({
        edges: [...store.edges, { id: nanoid(), source: selectedNodeId!, target: targetId, label }],
      })
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
    const updated = branches.map((b, i) => (i === index ? { ...b, [field]: value } : b))
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

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="bg-muted/40 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">After branch</span>
        </div>
        <div className="p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground/60">Continue to</Label>
            <Select
              value={getTargetForLabel('then') || '__none__'}
              onValueChange={(v) => setTargetForBranch('then', v === '__none__' ? '' : v)}
              options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Hint>
        Pick a target for each branch. A single condition is fine (no else needed). Use{' '}
        <strong>Continue to</strong> for a node that runs after the entire if/else.
      </Hint>
    </>
  )
}

// ── Parallel / Race — continuation edge management ──

function ForkFields({ hint }: { hint: string }) {
  const { targetOptions, getTargetForLabel, setTargetForLabel } = useEdgeManagement()

  return (
    <>
      <Hint>{hint}</Hint>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="bg-muted/40 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">After completion</span>
        </div>
        <div className="p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground/60">Continue to</Label>
            <Select
              value={getTargetForLabel('then') || '__none__'}
              onValueChange={(v) => setTargetForLabel('then', v === '__none__' ? '' : v)}
              options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ── Try/Catch — edge management for try, catch, finally paths ──

function TryCatchFields() {
  const { targetOptions, getTargetForLabel, setTargetForLabel } = useEdgeManagement()

  const slots = [
    { label: 'try', heading: 'Try path' },
    { label: 'catch', heading: 'Catch path' },
    { label: 'finally', heading: 'Finally path (optional)' },
    { label: 'then', heading: 'After try/catch' },
  ]

  return (
    <>
      <div className="space-y-2">
        {slots.map((slot) => (
          <div key={slot.label} className="overflow-hidden rounded-lg border border-border">
            <div className="bg-muted/40 px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">{slot.heading}</span>
            </div>
            <div className="p-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground/60">Go to</Label>
                <Select
                  value={getTargetForLabel(slot.label) || '__none__'}
                  onValueChange={(v) => setTargetForLabel(slot.label, v === '__none__' ? '' : v)}
                  options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Hint>
        The catch path receives the error as <code>err</code>. Finally runs regardless of success or
        failure.
      </Hint>
    </>
  )
}

// ── Loop — loop type config + body edge management ──

function LoopFields({
  node,
  onUpdate,
}: {
  node: WorkflowNode
  onUpdate: (d: Partial<WorkflowNode>) => void
}) {
  const { targetOptions, getTargetForLabel, setTargetForLabel } = useEdgeManagement()

  const loopType = String(node.data.loopType ?? 'forEach')

  const updateField = (field: string, value: unknown) => {
    onUpdate({ data: { ...node.data, [field]: value } })
  }

  return (
    <>
      <Field label="Loop Type">
        <Select
          value={loopType}
          onValueChange={(v) => updateField('loopType', v)}
          options={[
            { value: 'forEach', label: 'For Each' },
            { value: 'while', label: 'While' },
            { value: 'times', label: 'Times' },
          ]}
          className="h-8 text-xs"
        />
      </Field>

      {loopType === 'forEach' && (
        <>
          <Field label="Collection" hint="Expression resolving to an array">
            <Input
              value={String(node.data.collection ?? '')}
              onChange={(e) => updateField('collection', e.target.value)}
              debounceMs={300}
              placeholder="{{get_customers.customers}}"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Item Variable">
            <Input
              value={String(node.data.itemVar ?? 'item')}
              onChange={(e) => updateField('itemVar', e.target.value)}
              debounceMs={300}
              placeholder="item"
              className="font-mono text-xs"
            />
          </Field>
        </>
      )}

      {loopType === 'while' && (
        <Field label="Condition" hint="Loop while truthy (optional)">
          <Input
            value={String(node.data.condition ?? '')}
            onChange={(e) => updateField('condition', e.target.value)}
            debounceMs={300}
            placeholder="status !== 'done'"
            className="font-mono text-xs"
          />
        </Field>
      )}

      {loopType === 'times' && (
        <Field label="Count" hint="Number of iterations">
          <Input
            type="number"
            value={String(node.data.count ?? 5)}
            onChange={(e) => updateField('count', parseInt(e.target.value) || 1)}
            debounceMs={300}
            className="text-xs"
          />
        </Field>
      )}

      <Separator className="!bg-muted/60" />

      {[
        { lbl: 'body', heading: 'Loop body', hint: 'First node in body' },
        { lbl: 'then', heading: 'After loop', hint: 'Runs after loop completes' },
      ].map((slot) => (
        <div key={slot.lbl} className="overflow-hidden rounded-lg border border-border">
          <div className="bg-muted/40 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">{slot.heading}</span>
          </div>
          <div className="p-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground/60">{slot.hint}</Label>
              <Select
                value={getTargetForLabel(slot.lbl) || '__none__'}
                onValueChange={(v) => setTargetForLabel(slot.lbl, v === '__none__' ? '' : v)}
                options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      ))}

      <Hint>
        Connect the first node of the loop body. Chain additional nodes from it.
        {loopType === 'while' && ' Use a Break node inside the body to exit the loop.'}
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
  const heading =
    index === 0
      ? 'When this is true'
      : isElse
        ? 'Otherwise (default)'
        : 'Otherwise, when this is true'

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{heading}</span>
        {branchCount > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground/40 hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground/60">Label</Label>
          <Input
            value={branch.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            debounceMs={300}
            placeholder="e.g. approved, rejected"
            className="h-8 text-xs"
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
          <Label className="text-xs text-muted-foreground/60">Go to</Label>
          <Select
            value={currentTarget || '__none__'}
            onValueChange={onSetTarget}
            options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  )
}
