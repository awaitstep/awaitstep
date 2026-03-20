import { useState, useEffect, lazy, Suspense } from 'react'
import { X, Plus, Trash2, Link2, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { Separator } from '../ui/separator'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { InputParam, EnvBinding, WorkflowEnvVar } from '../../stores/workflow-store'
import { DEFAULT_TRIGGER_CODE } from '@awaitstep/provider-cloudflare/codegen'

const CodeEditor = lazy(() => import('../ui/code-editor').then((m) => ({ default: m.CodeEditor })))

export function WorkflowSettings() {
  const [editorReady, setEditorReady] = useState(false)
  useEffect(() => {
    const id = requestIdleCallback(() => setEditorReady(true))
    return () => cancelIdleCallback(id)
  }, [])

  const metadata = useWorkflowStore((s) => s.metadata)
  const inputParams = useWorkflowStore((s) => s.inputParams)
  const envBindings = useWorkflowStore((s) => s.envBindings)
  const workflowEnvVars = useWorkflowStore((s) => s.workflowEnvVars)
  const setMetadata = useWorkflowStore((s) => s.setMetadata)
  const setInputParams = useWorkflowStore((s) => s.setInputParams)
  const setEnvBindings = useWorkflowStore((s) => s.setEnvBindings)
  const setWorkflowEnvVars = useWorkflowStore((s) => s.setWorkflowEnvVars)
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const setTriggerCode = useWorkflowStore((s) => s.setTriggerCode)
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
    setEnvBindings([...envBindings, { name: '', type: 'kv' }])
  }

  const updateBinding = (index: number, data: Partial<EnvBinding>) => {
    setEnvBindings(envBindings.map((b, i) => (i === index ? { ...b, ...data } : b)))
  }

  const removeBinding = (index: number) => {
    setEnvBindings(envBindings.filter((_, i) => i !== index))
  }

  const addEnvVar = () => {
    setWorkflowEnvVars([...workflowEnvVars, { name: '', value: '' }])
  }

  const updateEnvVar = (index: number, data: Partial<WorkflowEnvVar>) => {
    setWorkflowEnvVars(workflowEnvVars.map((v, i) => (i === index ? { ...v, ...data } : v)))
  }

  const removeEnvVar = (index: number) => {
    setWorkflowEnvVars(workflowEnvVars.filter((_, i) => i !== index))
  }

  const linkToGlobal = (index: number) => {
    const v = workflowEnvVars[index]
    if (v.name) {
      updateEnvVar(index, { value: `{{global.env.${v.name}}}` })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] font-semibold text-foreground">Workflow Settings</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(false)}>
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

          <Separator />

          {/* Trigger Code */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-muted-foreground">Trigger Code</Label>
              {triggerCode && triggerCode !== DEFAULT_TRIGGER_CODE && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                  onClick={() => setTriggerCode('')}
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Code inside the <code className="font-mono">fetch()</code> handler. Has access to <code className="font-mono">request</code>, <code className="font-mono">env</code>, and <code className="font-mono">ctx</code>.
            </p>
            {editorReady ? (
              <Suspense fallback={<div className="h-[200px] rounded-lg border border-input bg-[oklch(0.12_0_0)]" />}>
                <CodeEditor
                  value={triggerCode || DEFAULT_TRIGGER_CODE}
                  onChange={setTriggerCode}
                  debounceMs={500}
                  language="typescript"
                  height="200px"
                />
              </Suspense>
            ) : (
              <div className="h-[200px] rounded-lg border border-input bg-[oklch(0.12_0_0)]" />
            )}
          </div>

          <Separator />

          {/* Input Parameters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-muted-foreground">Input Parameters</Label>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground" onClick={addParam}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Define the shape of event.payload passed when triggering the workflow.
            </p>
            {inputParams.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 italic">No input parameters defined</p>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeParam(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Workflow Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-muted-foreground">Environment Variables</Label>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground" onClick={addEnvVar}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Variables injected at deploy time. Use the link button to reference a global variable.
            </p>
            {workflowEnvVars.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 italic">No environment variables defined</p>
            ) : (
              <div className="space-y-2">
                {workflowEnvVars.map((envVar, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={envVar.name}
                        onChange={(e) => updateEnvVar(i, { name: e.target.value.toUpperCase() })}
                        placeholder="MY_API_KEY"
                        className="flex-1 h-8 text-xs font-mono"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-primary"
                        onClick={() => linkToGlobal(i)}
                        title="Link to global variable"
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeEnvVar(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(i, { value: e.target.value })}
                      placeholder="value or {{global.env.NAME}}"
                      className="h-7 text-[11px] font-mono text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Resource Bindings (KV, D1, R2, Service) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-muted-foreground">Resource Bindings</Label>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground" onClick={addBinding}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Cloudflare resource bindings (KV, D1, R2, Service).
            </p>
            {envBindings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 italic">No resource bindings defined</p>
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
                        { value: 'kv', label: 'KV' },
                        { value: 'd1', label: 'D1' },
                        { value: 'r2', label: 'R2' },
                        { value: 'service', label: 'Service' },
                      ]}
                      className="w-24 h-8 text-xs"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeBinding(i)}>
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
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
