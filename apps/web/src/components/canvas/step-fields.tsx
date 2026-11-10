import { useId, useState } from 'react'
import { ChevronDown, Maximize2, Minimize2, X } from 'lucide-react'
import type { ConfigField, WorkflowNode } from '@awaitstep/ir'
import { stepSourcePath } from '@awaitstep/ir'
import { stepModuleProblem } from '@awaitstep/codegen'
import { stepMeta, type StepSettingsOptions } from '../../lib/ide/step-summary'
import type { StepScope } from '../../lib/step-scope'
import type { NodeVisuals } from '../../lib/node-icon-map'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { CodeEditor } from '../ui/code-editor'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { DynamicFields, FieldRenderer, fieldTakesId } from './dynamic-fields'
import { ExportFields } from './export-fields'

type Kind = NonNullable<StepSettingsOptions['kind']>

/** The fields the Execution section lays out itself, in reading order. */
const EXECUTION_FIELDS = ['retryLimit', 'backoff', 'retryDelay', 'timeout'] as const

/** Every schema field this layout places by name; the rest render as a plain list. */
const PLACED_FIELDS: ReadonlySet<string> = new Set([
  'code',
  'inline',
  'export',
  'exportAs',
  ...EXECUTION_FIELDS,
])

/** What the Execution header says while the section is folded, or beside it. */
function executionSummary(node: WorkflowNode, kind: Kind): string {
  if (node.data.inline === true) return 'Inline'
  return stepMeta(node, { kind }) ?? (kind === 'script' ? 'No retries' : 'Default')
}

function stepCode(node: WorkflowNode): string {
  return String(node.data.code ?? '')
}

interface StepFieldsProps {
  node: WorkflowNode
  kind: Kind
  /** What the body can read, and the names its value travels under. */
  scope: StepScope
  schema: Record<string, ConfigField>
  onChange: (fieldId: string, value: unknown) => void
  onEnlarge: () => void
  /** True when the fields return from the enlarged editor, so focus lands back on Enlarge. */
  focusEnlarge?: boolean
  readOnly?: boolean
}

/**
 * A step's body in the inspector: its code, with the file it is in Code
 * and a way to enlarge the editor; then how it runs, folded under one
 * line that says what is set.
 */
export function StepFields({
  node,
  kind,
  scope,
  schema,
  onChange,
  onEnlarge,
  focusEnlarge = false,
  readOnly = false,
}: StepFieldsProps) {
  const [executionOpen, setExecutionOpen] = useState(true)
  const idBase = useId()
  const inlineId = `${idBase}-inline`
  const inline = node.data.inline === true
  const moduleProblem = stepModuleProblem(node, scope.varName)
  const rest = Object.fromEntries(
    Object.entries(schema).filter(([fieldId]) => !PLACED_FIELDS.has(fieldId)),
  )

  function handleCodeChange(value: string) {
    onChange('code', value)
  }

  function handleToggleExecution() {
    setExecutionOpen((open) => !open)
  }

  function handleInlineChange(checked: boolean) {
    onChange('inline', checked)
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Code<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <div className="overflow-hidden rounded-lg border border-input">
          <div className="flex h-7 items-center gap-2 border-b border-border/60 bg-muted/30 px-2.5 text-[11px] font-medium text-muted-foreground">
            <span className="text-primary">TS</span>
            <span className="truncate font-mono">{stepSourcePath(node.id)}</span>
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Enlarge editor"
              // Focus returns to where Collapse was pressed from.
              autoFocus={focusEnlarge}
              onClick={onEnlarge}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
          <CodeEditor
            value={stepCode(node)}
            onChange={handleCodeChange}
            debounceMs={300}
            language="typescript"
            height="160px"
            bordered={false}
            expandable={false}
            readOnly={readOnly}
          />
        </div>
        <p className="text-xs text-muted-foreground/60">
          {scope.status === 'cycle' ? (
            'The graph has a cycle, so nothing can be listed as in scope.'
          ) : scope.status === 'error' ? (
            'What is in scope could not be read.'
          ) : (
            <>
              {scope.upstream.length === 0 && 'No earlier steps. '}
              In scope:{' '}
              {[...scope.bindings, ...scope.upstream].map((name) => (
                <span key={name}>
                  <code className="font-mono text-foreground/70">inputs.{name}</code>,{' '}
                </span>
              ))}
              <code className="font-mono text-foreground/70">event.payload</code>,{' '}
              <code className="font-mono text-foreground/70">ctx.attempt</code>.{' '}
              <code className="font-mono text-foreground/70">return</code> sets this step’s value.
            </>
          )}
        </p>
        {moduleProblem && <p className="text-xs text-destructive">{moduleProblem}</p>}
      </div>

      {Object.keys(rest).length > 0 && (
        <DynamicFields
          configSchema={rest}
          data={node.data}
          onChange={onChange}
          nodeId={node.id}
          readOnly={readOnly}
        />
      )}

      <div className="border-t border-border/60 pt-3">
        <button
          type="button"
          aria-expanded={executionOpen}
          onClick={handleToggleExecution}
          className="flex w-full items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              !executionOpen && '-rotate-90',
            )}
          />
          <span className="text-xs font-semibold text-foreground">Execution</span>
          <span className="ml-auto truncate text-xs text-muted-foreground/60">
            {executionSummary(node, kind)}
          </span>
        </button>
        {executionOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2.5">
              <Switch
                id={inlineId}
                checked={inline}
                onCheckedChange={handleInlineChange}
                label="Inline — no step"
              />
              <label htmlFor={inlineId} className="min-w-0 cursor-pointer">
                <div className="text-xs text-foreground">Inline — no step</div>
                <div className="text-[11px] text-muted-foreground/60">
                  Runs in the body. No retries, timeout or durability.
                </div>
              </label>
            </div>
            {!inline && <ExportFields node={node} kind={kind} scope={scope} onChange={onChange} />}
            {!inline && (
              <div className="grid grid-cols-2 gap-2.5">
                {EXECUTION_FIELDS.map((fieldId) => {
                  const field = schema[fieldId]
                  if (!field) return null
                  const controlId = fieldTakesId(field) ? `${idBase}-${fieldId}` : undefined
                  return (
                    <div key={fieldId} className="min-w-0 space-y-1.5">
                      <Label htmlFor={controlId} className="text-xs text-muted-foreground">
                        {field.label}
                      </Label>
                      <FieldRenderer
                        id={controlId}
                        field={field}
                        value={node.data[fieldId]}
                        onChange={(value) => onChange(fieldId, value)}
                      />
                      {field.description && (
                        <p className="text-[11px] text-muted-foreground/60">{field.description}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

interface StepEnlargedEditorProps {
  node: WorkflowNode
  kind: Kind
  visuals: NodeVisuals
  readOnly?: boolean
  onChange: (fieldId: string, value: unknown) => void
  onCollapse: () => void
  onClose: () => void
}

/**
 * The step's code filling the inspector: the same editor, wider, with the
 * step's name, file and settings in the bar. Collapse brings the fields back.
 */
export function StepEnlargedEditor({
  node,
  kind,
  visuals,
  readOnly = false,
  onChange,
  onCollapse,
  onClose,
}: StepEnlargedEditorProps) {
  const meta = node.data.inline === true ? 'inline' : stepMeta(node, { kind })

  function handleCodeChange(value: string) {
    onChange('code', value)
  }

  return (
    <div className="flex h-full flex-col w-[100%]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            visuals.accent,
          )}
        >
          {visuals.icon}
        </div>
        <span className="truncate text-sm font-medium text-foreground">{node.name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/60">
          {stepSourcePath(node.id)}
        </span>
        <span className="flex-1" />
        <span className="min-w-0 truncate text-xs text-muted-foreground/60">
          TypeScript{meta ? ` · ${meta}` : ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Collapse editor"
          // Enlarge unmounted the focused button; focus lands on its counterpart.
          autoFocus
          onClick={onCollapse}
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={stepCode(node)}
          onChange={handleCodeChange}
          debounceMs={300}
          language="typescript"
          height="100%"
          bordered={false}
          expandable={false}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
