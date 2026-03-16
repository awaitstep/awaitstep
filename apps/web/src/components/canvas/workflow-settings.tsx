import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { Separator } from '../ui/separator'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { InputParam, EnvBinding } from '../../stores/workflow-store'

export function WorkflowSettings() {
  const metadata = useWorkflowStore((s) => s.metadata)
  const inputParams = useWorkflowStore((s) => s.inputParams)
  const envBindings = useWorkflowStore((s) => s.envBindings)
  const setMetadata = useWorkflowStore((s) => s.setMetadata)
  const setInputParams = useWorkflowStore((s) => s.setInputParams)
  const setEnvBindings = useWorkflowStore((s) => s.setEnvBindings)
  const setShowSettings = useWorkflowStore((s) => s.setShowSettings)

  const addParam = () => {
    setInputParams([...inputParams, { name: '', type: 'string' }])
  }

  const updateParam = (index: number, data: Partial<InputParam>) => {
    setInputParams(inputParams.map((p, i) => (i === index ? { ...p, ...data } : p)))
  }

  const removeParam = (index: number) => {
    setInputParams(inputParams.filter((_, i) => i !== index))
  }

  const addBinding = () => {
    setEnvBindings([...envBindings, { name: '', type: 'variable' }])
  }

  const updateBinding = (index: number, data: Partial<EnvBinding>) => {
    setEnvBindings(envBindings.map((b, i) => (i === index ? { ...b, ...data } : b)))
  }

  const removeBinding = (index: number) => {
    setEnvBindings(envBindings.filter((_, i) => i !== index))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[13px] font-semibold text-white/90">Workflow Settings</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40 hover:text-white/80" onClick={() => setShowSettings(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        <div className="space-y-4">
          {/* Workflow Info */}
          <Field label="Workflow Name">
            <Input value={metadata.name} onChange={(e) => setMetadata({ name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={metadata.description ?? ''} onChange={(e) => setMetadata({ description: e.target.value || undefined })} placeholder="Optional description" />
          </Field>

          <Separator className="!bg-white/[0.06]" />

          {/* Input Parameters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-white/50">Input Parameters</Label>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-white/40" onClick={addParam}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-white/20 mb-2">
              Define the shape of event.payload passed when triggering the workflow.
            </p>
            {inputParams.length === 0 ? (
              <p className="text-[11px] text-white/20 italic">No input parameters defined</p>
            ) : (
              <div className="space-y-2">
                {inputParams.map((param, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={param.name}
                      onChange={(e) => updateParam(i, { name: e.target.value })}
                      placeholder="name"
                      className="flex-1 h-8 text-xs"
                    />
                    <Select
                      value={param.type}
                      onValueChange={(v) => updateParam(i, { type: v as InputParam['type'] })}
                      options={[
                        { value: 'string', label: 'string' },
                        { value: 'number', label: 'number' },
                        { value: 'boolean', label: 'boolean' },
                        { value: 'object', label: 'object' },
                      ]}
                      className="w-24 h-8 text-xs"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-white/30 hover:text-destructive" onClick={() => removeParam(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className="!bg-white/[0.06]" />

          {/* Environment Bindings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-white/50">Environment Bindings</Label>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-white/40" onClick={addBinding}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-white/20 mb-2">
              Define env bindings available in your Worker (KV, D1, R2, secrets, etc).
            </p>
            {envBindings.length === 0 ? (
              <p className="text-[11px] text-white/20 italic">No bindings defined</p>
            ) : (
              <div className="space-y-2">
                {envBindings.map((binding, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={binding.name}
                      onChange={(e) => updateBinding(i, { name: e.target.value })}
                      placeholder="MY_KV"
                      className="flex-1 h-8 text-xs font-mono"
                    />
                    <Select
                      value={binding.type}
                      onValueChange={(v) => updateBinding(i, { type: v as EnvBinding['type'] })}
                      options={[
                        { value: 'variable', label: 'Variable' },
                        { value: 'secret', label: 'Secret' },
                        { value: 'kv', label: 'KV' },
                        { value: 'd1', label: 'D1' },
                        { value: 'r2', label: 'R2' },
                        { value: 'service', label: 'Service' },
                      ]}
                      className="w-24 h-8 text-xs"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-white/30 hover:text-destructive" onClick={() => removeBinding(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-white/50">{label}</Label>
      {children}
    </div>
  )
}
