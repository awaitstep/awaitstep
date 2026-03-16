import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Info, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { CodeEditor } from '../ui/code-editor'
import { Select } from '../ui/select'
import { DateTimePicker } from '../ui/datetime-picker'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nanoid } from 'nanoid'
import type { WorkflowNode } from '@awaitstep/ir'

const NODE_TYPE_LABELS: Record<string, string> = {
  'step': 'step.do()',
  'sleep': 'step.sleep()',
  'sleep-until': 'step.sleepUntil()',
  'branch': 'if / else',
  'parallel': 'Promise.all()',
  'http-request': 'fetch() in step.do()',
  'wait-for-event': 'step.waitForEvent()',
}

const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9_-]+$/

export function validateNode(node: WorkflowNode): string[] {
  const errors: string[] = []
  if (!node.name.trim()) errors.push('Step name is required')

  switch (node.type) {
    case 'step':
      if (!node.code.trim()) errors.push('Step code cannot be empty')
      break
    case 'sleep': {
      const raw = String(node.duration).trim()
      if (!raw) {
        errors.push('Duration is required')
      } else {
        const dur = typeof node.duration === 'number' ? node.duration : parseInt(raw)
        if (isNaN(dur) || dur <= 0) errors.push('Duration must be at least 1')
      }
      break
    }
    case 'sleep-until':
      if (!node.timestamp.trim()) errors.push('Timestamp is required')
      else if (isNaN(Date.parse(node.timestamp))) errors.push('Timestamp is not a valid date')
      break
    case 'http-request':
      if (!node.url.trim()) errors.push('URL is required')
      break
    case 'wait-for-event':
      if (!node.eventType.trim()) errors.push('Event type is required')
      else if (!EVENT_TYPE_PATTERN.test(node.eventType)) errors.push('Event type contains invalid characters')
      break
    case 'branch':
      if (node.branches.length < 2) errors.push('At least 2 branches are required')
      break
  }
  return errors
}

export function NodeConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)

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

  const update = (data: Partial<WorkflowNode>) => {
    updateNodeData(selectedNode.id, data)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <span className="text-[13px] font-semibold text-white/90">Edit Node</span>
          <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
            {NODE_TYPE_LABELS[irNode.type] ?? irNode.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeNode(selectedNode.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40 hover:text-white/80" onClick={tryClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        <div className="space-y-4">
          <Field label="Step Name" hint="Max 256 characters">
            <Input value={irNode.name} onChange={(e) => update({ name: e.target.value.slice(0, 256) })} placeholder="My step" maxLength={256} />
          </Field>

          <Separator className="!bg-white/[0.06]" />

          {irNode.type === 'step' && <StepFields node={irNode} onUpdate={update} />}
          {irNode.type === 'sleep' && <SleepFields node={irNode} onUpdate={update} />}
          {irNode.type === 'sleep-until' && <SleepUntilFields node={irNode} onUpdate={update} />}
          {irNode.type === 'branch' && <BranchFields node={irNode} onUpdate={update} />}
          {irNode.type === 'parallel' && <ParallelFields />}
          {irNode.type === 'http-request' && <HttpFields node={irNode} onUpdate={update} />}
          {irNode.type === 'wait-for-event' && <EventFields node={irNode} onUpdate={update} />}
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <span className="text-[10px] text-white/20">ID: {selectedNode.id}</span>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-white/50">{label}</Label>
        {hint && <span className="text-[10px] text-white/20">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px] leading-relaxed text-white/30">
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-white/20" />
      <span>{children}</span>
    </div>
  )
}

// ── step.do() ──

function buildStepCode(name: string, body: string): string {
  return `await step.do("${name}", async (ctx) => {\n${body}\n});`
}

function parseStepCode(code: string): { name: string; body: string } | null {
  const match = code.match(
    /(?:await\s+)?step\.do\s*\(\s*["'`]([^"'`]*)["'`]\s*,\s*(?:\{[^}]*\}\s*,\s*)?async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/,
  )
  if (!match) return null
  return { name: match[1]!, body: match[3]!.trimEnd() }
}

const NESTED_STEP_PATTERN = /step\.(do|sleep|sleepUntil|waitForEvent)\s*\(/

function detectNestedSteps(code: string): boolean {
  const parsed = parseStepCode(code)
  if (!parsed) return false
  return NESTED_STEP_PATTERN.test(parsed.body)
}

function StepFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'step' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const retries = node.config?.retries
  const [localCode, setLocalCode] = useState(() => buildStepCode(node.name, node.code))
  const isInternalUpdate = useRef(false)

  const hasNestedSteps = detectNestedSteps(localCode)

  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }
    setLocalCode(buildStepCode(node.name, node.code))
  }, [node.name])

  const handleCodeChange = (v: string) => {
    setLocalCode(v)
    isInternalUpdate.current = true
    const parsed = parseStepCode(v)
    if (parsed) {
      onUpdate({ name: parsed.name, code: parsed.body })
    } else {
      onUpdate({ code: v })
    }
  }

  return (
    <>
      <Field label="Step Code">
        <CodeEditor
          value={localCode}
          onChange={handleCodeChange}
          language="typescript"
          height="280px"
        />
        {hasNestedSteps && (
          <div className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-relaxed text-destructive">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong>Nested step calls are not allowed.</strong> You cannot call step.do(), step.sleep(), step.sleepUntil(), or step.waitForEvent() inside a step.do() callback. Use separate nodes on the canvas and connect them with edges to define execution order.
            </span>
          </div>
        )}
        <Hint>
          Edit the full step.do() call. <code className="text-white/50">ctx.attempt</code> is the current retry (1-indexed). Return value must be serializable. Use separate canvas nodes for sequential steps.
        </Hint>
      </Field>

      <Separator className="!bg-white/[0.06]" />

      <Field label="Retry Limit" hint="Default: 5">
        <Input
          type="number"
          min={0}
          value={retries?.limit ?? ''}
          onChange={(e) => onUpdate({ config: { ...node.config, retries: { limit: Number(e.target.value), delay: retries?.delay ?? '10 seconds', backoff: retries?.backoff } } })}
          placeholder="5"
        />
      </Field>

      <Field label="Retry Delay" hint="Default: 10 seconds">
        <DurationInput
          value={String(retries?.delay ?? '')}
          onChange={(v) => onUpdate({ config: { ...node.config, retries: { limit: retries?.limit ?? 5, delay: v, backoff: retries?.backoff } } })}
          placeholder="10 seconds"
        />
      </Field>

      <Field label="Backoff" hint="Default: exponential">
        <Select
          value={retries?.backoff ?? 'exponential'}
          onValueChange={(v) => onUpdate({ config: { ...node.config, retries: { limit: retries?.limit ?? 5, delay: retries?.delay ?? '10 seconds', backoff: v as 'constant' | 'linear' | 'exponential' } } })}
          options={[
            { value: 'exponential', label: 'Exponential' },
            { value: 'linear', label: 'Linear' },
            { value: 'constant', label: 'Constant' },
          ]}
          className="w-full"
        />
      </Field>

      <Field label="Timeout" hint="Default: 10 minutes (per attempt)">
        <DurationInput
          value={String(node.config?.timeout ?? '')}
          onChange={(v) => onUpdate({ config: { ...node.config, timeout: v || undefined } })}
          placeholder="10 minutes"
        />
      </Field>

      <Hint>
        Each retry attempt has its own timeout. Return value must be serializable (no Functions, Symbols, or circular refs).
      </Hint>
    </>
  )
}

// ── step.sleep() ──

const DURATION_UNITS = ['second', 'minute', 'hour', 'day'] as const

const MAX_DAYS = 365
const MAX_SECONDS = MAX_DAYS * 86400

const UNIT_TO_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
}

function clampDuration(amount: number, unit: string): number {
  const unitSeconds = UNIT_TO_SECONDS[unit] ?? 1
  const maxForUnit = Math.floor(MAX_SECONDS / unitSeconds)
  return Math.min(Math.max(1, amount), maxForUnit)
}

function parseDuration(value: string | number): { amount: number; unit: string } {
  if (typeof value === 'number') return { amount: value, unit: 'second' }
  const match = value.match(/^(\d+)\s*(.+?)s?$/)
  if (!match) return { amount: 10, unit: 'second' }
  const unit = match[2]!
  return { amount: Number(match[1]), unit: DURATION_UNITS.includes(unit as typeof DURATION_UNITS[number]) ? unit : 'second' }
}

function SleepFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'sleep' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const { amount, unit } = parseDuration(node.duration)
  const maxForUnit = Math.floor(MAX_SECONDS / (UNIT_TO_SECONDS[unit] ?? 1))
  const [localAmount, setLocalAmount] = useState(String(amount))

  useEffect(() => {
    setLocalAmount(String(amount))
  }, [amount])

  return (
    <>
      <Field label="Duration" hint="Max 365 days">
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={maxForUnit}
            value={localAmount}
            onChange={(e) => setLocalAmount(e.target.value)}
            onBlur={() => {
              const num = Number(localAmount)
              if (!localAmount.trim() || isNaN(num) || num <= 0) {
                onUpdate({ duration: '' })
                return
              }
              const clamped = clampDuration(num, unit)
              setLocalAmount(String(clamped))
              onUpdate({ duration: `${clamped} ${unit}` })
            }}
            className="flex-1"
          />
          <Select
            value={unit}
            onValueChange={(v) => {
              const num = Number(localAmount)
              if (!localAmount.trim() || isNaN(num) || num <= 0) return
              const clamped = clampDuration(num, v)
              setLocalAmount(String(clamped))
              onUpdate({ duration: `${clamped} ${v}` })
            }}
            options={DURATION_UNITS.map((u) => ({ value: u, label: u }))}
            className="w-28"
          />
        </div>
      </Field>
      <Hint>Does not count toward the step limit. Resuming instances take priority over new ones.</Hint>
    </>
  )
}

// ── step.sleepUntil() ──

function SleepUntilFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'sleep-until' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const minDateTime = new Date(Date.now() + 60 * 60 * 1000)
  const selectedDate = node.timestamp ? new Date(node.timestamp) : null
  const isPast = selectedDate && selectedDate < minDateTime

  return (
    <>
      <Field label="Date & Time" hint="Min 1 hour from now">
        <DateTimePicker
          value={selectedDate}
          minDate={minDateTime}
          onChange={(date) => {
            onUpdate({ timestamp: date ? date.toISOString() : '' })
          }}
          placeholder="Pick a date & time"
        />
        {isPast && (
          <p className="text-[11px] text-destructive">Selected time is in the past. Must be at least 1 hour from now.</p>
        )}
      </Field>
      {selectedDate && !isPast && (
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px] text-white/30">
          Will resume at {selectedDate.toLocaleString()}
        </div>
      )}
      <Hint>Useful for scheduling work at a specific time.</Hint>
    </>
  )
}

// ── Branch (if/else if/else) ──

function BranchFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'branch' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const allNodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)

  // Outgoing edges from this branch node
  const outgoingEdges = edges.filter((e) => e.source === selectedNodeId)

  // Nodes available as targets (exclude self)
  const targetOptions = allNodes
    .filter((n) => n.id !== selectedNodeId)
    .map((n) => ({ value: n.id, label: n.data.irNode.name }))

  // Find which node a branch label points to
  const getTargetForLabel = (label: string) => {
    const edge = outgoingEdges.find((e) => e.label === label)
    return edge?.target ?? ''
  }

  const setTargetForBranch = (label: string, targetId: string) => {
    const store = useWorkflowStore.getState()
    const existingEdge = outgoingEdges.find((e) => e.label === label)

    if (targetId === '') {
      // Remove edge
      if (existingEdge) {
        const filtered = store.edges.filter((e) => e.id !== existingEdge.id)
        useWorkflowStore.setState({ edges: filtered })
      }
      return
    }

    if (existingEdge) {
      // Update existing edge target
      const updated = store.edges.map((e) =>
        e.id === existingEdge.id ? { ...e, target: targetId } : e,
      )
      useWorkflowStore.setState({ edges: updated })
    } else {
      // Create new edge
      const newEdge = { id: nanoid(), source: selectedNodeId!, target: targetId, label }
      useWorkflowStore.setState({ edges: [...store.edges, newEdge] })
    }
  }

  const updateBranch = (index: number, field: 'label' | 'condition', value: string) => {
    const branches = node.branches.map((b, i) => i === index ? { ...b, [field]: value } : b)
    onUpdate({ branches })
  }

  const addBranch = () => {
    const existingLabels = new Set(node.branches.map((b) => b.label))
    let label = 'branch'
    let i = 1
    while (existingLabels.has(label)) {
      label = `branch-${i++}`
    }
    const branches = [...node.branches]
    const lastBranch = branches[branches.length - 1]
    if (lastBranch && lastBranch.condition === '') {
      branches.splice(branches.length - 1, 0, { label, condition: 'true' })
    } else {
      branches.push({ label, condition: 'true' })
    }
    onUpdate({ branches })
  }

  const removeBranch = (index: number) => {
    if (node.branches.length <= 1) return
    // Also remove the associated edge
    const label = node.branches[index]!.label
    const edge = outgoingEdges.find((e) => e.label === label)
    if (edge) {
      const store = useWorkflowStore.getState()
      useWorkflowStore.setState({ edges: store.edges.filter((e) => e.id !== edge.id) })
    }
    onUpdate({ branches: node.branches.filter((_, i) => i !== index) })
  }

  return (
    <>
      <div className="space-y-2">
        {node.branches.map((branch, index) => {
          const isElse = branch.condition === '' && index === node.branches.length - 1
          const heading = index === 0 ? 'When this is true' : isElse ? 'Otherwise (default)' : 'Otherwise, when this is true'
          const currentTarget = getTargetForLabel(branch.label)

          return (
            <div key={index} className="overflow-hidden rounded-lg border border-white/[0.06]">
              <div className="flex items-center justify-between bg-white/[0.03] px-3 py-1.5">
                <span className="text-[11px] font-medium text-white/50">{heading}</span>
                {node.branches.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-white/20 hover:text-destructive" onClick={() => removeBranch(index)}>
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-2 p-3">
                {!isElse && (
                  <CodeEditor
                    value={branch.condition}
                    onChange={(v) => updateBranch(index, 'condition', v)}
                    language="javascript"
                    height="40px"
                  />
                )}

                <div className="space-y-1">
                  <Label className="text-[10px] text-white/30">Go to</Label>
                  <Select
                    value={currentTarget || '__none__'}
                    onValueChange={(v) => setTargetForBranch(branch.label, v === '__none__' ? '' : v)}
                    options={[{ value: '__none__', label: 'Not connected' }, ...targetOptions]}
                    className="h-8 text-[11px]"
                  />
                </div>
              </div>
            </div>
          )
        })}
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

// ── Parallel (Promise.all) ──

function ParallelFields() {
  return (
    <Hint>Connect multiple nodes from this output to run them concurrently via Promise.all(). Not natively durable — use separate Workflow instances for durable parallelism.</Hint>
  )
}

// ── HTTP Request (fetch in step.do) ──

function HttpFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'http-request' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const retries = node.config?.retries

  return (
    <>
      <Field label="Method">
        <Select
          value={node.method}
          onValueChange={(v) => onUpdate({ method: v as typeof node.method })}
          options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => ({ value: m, label: m }))}
          className="w-full"
        />
      </Field>

      <Field label="URL">
        <Input value={node.url} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://api.example.com/data" />
      </Field>

      <Field label="Headers" hint="JSON object">
        <CodeEditor
          value={node.headers ? JSON.stringify(node.headers, null, 2) : ''}
          onChange={(v) => {
            try { onUpdate({ headers: v ? JSON.parse(v) : undefined }) } catch { /* invalid JSON */ }
          }}
          language="json"
          height="80px"
        />
      </Field>

      {['POST', 'PUT', 'PATCH'].includes(node.method) && (
        <Field label="Body">
          <CodeEditor
            value={node.body ?? ''}
            onChange={(v) => onUpdate({ body: v || undefined })}
            language="json"
            height="120px"
          />
        </Field>
      )}

      <Separator className="!bg-white/[0.06]" />

      <Field label="Retry Limit" hint="Default: 5">
        <Input
          type="number"
          min={0}
          value={retries?.limit ?? ''}
          onChange={(e) => onUpdate({ config: { ...node.config, retries: { limit: Number(e.target.value), delay: retries?.delay ?? '10 seconds', backoff: retries?.backoff } } })}
          placeholder="5"
        />
      </Field>

      <Field label="Timeout" hint="Default: 10 minutes">
        <DurationInput
          value={String(node.config?.timeout ?? '')}
          onChange={(v) => onUpdate({ config: { ...node.config, timeout: v || undefined } })}
          placeholder="10 minutes"
        />
      </Field>
    </>
  )
}

// ── step.waitForEvent() ──

function EventFields({ node, onUpdate }: { node: Extract<WorkflowNode, { type: 'wait-for-event' }>; onUpdate: (d: Partial<WorkflowNode>) => void }) {
  const eventTypeValid = /^[a-zA-Z0-9_-]*$/.test(node.eventType)

  return (
    <>
      <Field label="Event Type" hint="Max 100 chars, a-z 0-9 - _ only">
        <Input
          value={node.eventType}
          onChange={(e) => onUpdate({ eventType: e.target.value.slice(0, 100) })}
          placeholder="user-approval"
          maxLength={100}
          className={!eventTypeValid ? '!border-destructive' : ''}
        />
        {!eventTypeValid && (
          <p className="text-[11px] text-destructive">Only letters, digits, hyphens, and underscores allowed. Dots are not supported.</p>
        )}
      </Field>

      <Field label="Timeout" hint="Default: 24 hours, max 365 days">
        <DurationInput
          value={String(node.timeout ?? '')}
          onChange={(v) => onUpdate({ timeout: v || undefined })}
          placeholder="24 hours"
        />
      </Field>

      <Hint>
        When timeout expires, the Workflow throws an error. Wrap in try-catch if you want the Workflow to continue. Send events via instance.sendEvent() or the REST API.
      </Hint>
    </>
  )
}

// ── Shared duration input ──

function DurationInput({ value, onChange }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { amount, unit } = parseDurationStr(value)
  const maxForUnit = Math.floor(MAX_SECONDS / (UNIT_TO_SECONDS[unit] ?? 1))
  const [localAmount, setLocalAmount] = useState(String(amount || ''))

  useEffect(() => {
    setLocalAmount(String(amount || ''))
  }, [amount])

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        max={maxForUnit}
        value={localAmount}
        onChange={(e) => setLocalAmount(e.target.value)}
        onBlur={() => {
          if (!localAmount) return
          const clamped = clampDuration(Number(localAmount) || 1, unit)
          setLocalAmount(String(clamped))
          onChange(`${clamped} ${unit}`)
        }}
        placeholder="10"
        className="flex-1"
      />
      <Select
        value={unit}
        onValueChange={(v) => {
          const clamped = clampDuration(Number(localAmount) || 10, v)
          setLocalAmount(String(clamped))
          onChange(`${clamped} ${v}`)
        }}
        options={DURATION_UNITS.map((u) => ({ value: u, label: u }))}
        className="w-28"
      />
    </div>
  )
}

function parseDurationStr(value: string): { amount: number; unit: string } {
  if (!value) return { amount: 0, unit: 'second' }
  const match = value.match(/^(\d+)\s*(.+?)s?$/)
  if (!match) return { amount: 0, unit: 'second' }
  const unit = match[2]!
  return { amount: Number(match[1]), unit: DURATION_UNITS.includes(unit as typeof DURATION_UNITS[number]) ? unit : 'second' }
}
