import { useCallback } from 'react'
import { X, Plus, Trash2, Link2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { WorkflowEnvVar } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'

export function WorkflowSettings() {
  const { metadata, workflowEnvVars } = useWorkflowStore(
    useShallow((s) => ({
      metadata: s.metadata,
      workflowEnvVars: s.workflowEnvVars,
    })),
  )
  const { setMetadata, setWorkflowEnvVars, setShowSettings } = useWorkflowStore()

  const addEnvVar = useCallback(() => {
    setWorkflowEnvVars([...useWorkflowStore.getState().workflowEnvVars, { name: '', value: '' }])
  }, [setWorkflowEnvVars])

  const updateEnvVar = useCallback(
    (index: number, data: Partial<WorkflowEnvVar>) => {
      setWorkflowEnvVars(
        useWorkflowStore
          .getState()
          .workflowEnvVars.map((v, i) => (i === index ? { ...v, ...data } : v)),
      )
    },
    [setWorkflowEnvVars],
  )

  const removeEnvVar = useCallback(
    (index: number) => {
      setWorkflowEnvVars(useWorkflowStore.getState().workflowEnvVars.filter((_, i) => i !== index))
    },
    [setWorkflowEnvVars],
  )

  const linkToGlobal = useCallback(
    (index: number) => {
      const v = useWorkflowStore.getState().workflowEnvVars[index]
      if (v?.name) {
        setWorkflowEnvVars(
          useWorkflowStore
            .getState()
            .workflowEnvVars.map((ev, i) =>
              i === index ? { ...ev, value: `{{global.env.${v.name}}}` } : ev,
            ),
        )
      }
    },
    [setWorkflowEnvVars],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] font-semibold text-foreground">Workflow Settings</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setShowSettings(false)}
        >
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
            <Input
              value={metadata.description ?? ''}
              onChange={(e) => setMetadata({ description: e.target.value || '' })}
              placeholder="Optional description"
            />
          </Field>

          <Separator />

          {/* Workflow Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] text-muted-foreground">Environment Variables</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                onClick={addEnvVar}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Variables injected at deploy time. Use the link button to reference a global variable.
            </p>
            {workflowEnvVars.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 italic">
                No environment variables defined
              </p>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-destructive"
                        onClick={() => removeEnvVar(i)}
                      >
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
