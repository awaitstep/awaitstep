import { useRef } from 'react'
import type { QuickTestField } from '../../lib/ide/quick-test'
import { nextTabIndex } from '../../lib/ide/tabs'
import { cn } from '../../lib/utils'

const PANEL_ID = 'quick-test-args-panel'
const tabId = (field: QuickTestField) => `quick-test-tab-${field}`

const FIELDS: QuickTestField[] = ['inputs', 'env', 'event']

const HINTS: Record<QuickTestField, string> = {
  inputs: 'What the step reads from inputs',
  env: 'Secrets and project variables start blank. Not remembered.',
  event: 'The trigger event the step receives',
}

interface QuickTestArgsProps {
  active: QuickTestField
  texts: Record<QuickTestField, string>
  /** The field refused as not JSON on the last run. */
  invalid: QuickTestField | null
  /** The step reads nothing from `inputs`, which is worth saying on that tab. */
  noInputs: boolean
  onSelect: (field: QuickTestField) => void
  onChange: (field: QuickTestField, text: string) => void
}

/** inputs | env | event as tabs over one editor, so the result stays in view beside them. */
export function QuickTestArgs({
  active,
  texts,
  invalid,
  noInputs,
  onSelect,
  onChange,
}: QuickTestArgsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(event: React.KeyboardEvent) {
    const next = nextTabIndex(event.key, FIELDS.indexOf(active), FIELDS.length)
    if (next === null) return
    event.preventDefault()
    onSelect(FIELDS[next]!)
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(active, event.target.value)
  }

  const hint =
    invalid === active
      ? 'Not valid JSON'
      : noInputs && active === 'inputs'
        ? 'This step reads nothing from inputs'
        : HINTS[active]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Step arguments"
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1"
      >
        {FIELDS.map((field) => (
          <ArgTab
            key={field}
            field={field}
            active={active === field}
            invalid={invalid === field}
            onSelect={onSelect}
          />
        ))}
        <span
          className={cn(
            'ml-2 truncate text-[11px]',
            invalid === active ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {hint}
        </span>
      </div>
      <textarea
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        value={texts[active]}
        onChange={handleTextChange}
        spellCheck={false}
        className={cn(
          'min-h-16 flex-1 resize-none rounded-md border border-input bg-editor p-2 font-mono text-xs',
          invalid === active && 'border-destructive',
        )}
      />
    </div>
  )
}

function ArgTab({
  field,
  active,
  invalid,
  onSelect,
}: {
  field: QuickTestField
  active: boolean
  invalid: boolean
  onSelect: (field: QuickTestField) => void
}) {
  function handleClick() {
    onSelect(field)
  }

  return (
    <button
      type="button"
      role="tab"
      id={tabId(field)}
      aria-selected={active}
      aria-controls={PANEL_ID}
      tabIndex={active ? 0 : -1}
      onClick={handleClick}
      className={cn(
        'rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        invalid && 'text-destructive',
      )}
    >
      {field}
    </button>
  )
}
