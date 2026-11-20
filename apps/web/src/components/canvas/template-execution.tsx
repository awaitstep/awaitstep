import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RuntimeHints, StepConfig, WorkflowNode } from '@awaitstep/ir'
import { appliedStepSettings } from '@awaitstep/codegen'
import { cn } from '../../lib/utils'
import { InlineSwitch } from './inline-switch'

/** What a durable template node runs with, in words: its node.json retries and timeout. */
export function templateExecutionLine(config: StepConfig | undefined): string {
  if (!config) return 'Runtime defaults'
  const parts: string[] = []
  if (config.retries) parts.push(`retries ${config.retries.limit}`)
  if (config.timeout !== undefined) parts.push(`timeout ${config.timeout}`)
  return parts.join(', ')
}

interface TemplateExecutionProps {
  node: WorkflowNode
  /** The node's node.json runtime hints. */
  runtime: RuntimeHints | undefined
  onChange: (fieldId: string, value: unknown) => void
}

/**
 * How a custom or marketplace node runs: durable (a step, with the retries
 * and timeout its node.json declares) or Inline. The retries are the
 * node's own, shown read-only: its author changes them in node.json.
 */
export function TemplateExecution({ node, runtime, onChange }: TemplateExecutionProps) {
  const [open, setOpen] = useState(true)
  const inline = node.data.inline === true
  const applied = appliedStepSettings(node, runtime)
  const summary = inline ? 'Inline' : templateExecutionLine(applied.config)
  // A config saved on the node (by the API or an older version) wins over node.json.
  const origin = node.config ? 'set on this node' : 'from node.json'

  function handleToggle() {
    setOpen((value) => !value)
  }

  function handleInlineChange(checked: boolean) {
    // Unset rather than false: a durable node's data stays what its template reads.
    onChange('inline', checked ? true : undefined)
  }

  return (
    <div className="border-t border-border/60 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90',
          )}
        />
        <span className="text-xs font-semibold text-foreground">Execution</span>
        <span className="ml-auto truncate text-xs text-muted-foreground/60">{summary}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <InlineSwitch checked={inline} onChange={handleInlineChange} />
          {!inline && (
            <p className="text-2xs text-muted-foreground">
              {applied.config
                ? `Runs as a step: ${templateExecutionLine(applied.config)}, ${origin}.`
                : 'Runs as a step with the runtime’s default retries.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
