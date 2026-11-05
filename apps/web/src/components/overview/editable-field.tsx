import { useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useApi } from '../../contexts/api-client-context'

interface EditableProps {
  workflowId: string
  initialValue: string
  /** Size and weight of the text, e.g. a page heading's `text-2xl`. */
  className?: string
  /** The viewer can't edit it (a Viewer): plain text, nothing to click. */
  readOnly?: boolean
}

/** Saves one field and refreshes everywhere the workflow is shown: its page, the old list, the dashboard's lists. */
function useSaveField(workflowId: string, field: 'name' | 'description') {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    meta: {
      toast:
        field === 'name'
          ? { success: 'Renamed', error: 'Couldn’t rename it' }
          : { success: 'Description saved', error: 'Couldn’t save the description' },
    },
    mutationFn: (value: string) => api.updateWorkflow(workflowId, { [field]: value }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['workflows'] }),
        queryClient.invalidateQueries({ queryKey: ['dash'] }),
      ]),
  })
}

/**
 * Enter and Escape close the field, and some browsers then fire blur on the
 * input they remove: that blur must not save again (Enter) or save at all (Escape).
 */
function useClosing() {
  const closing = useRef(false)
  return {
    reset() {
      closing.current = false
    },
    /** True once the field has closed: the caller does nothing more. */
    already() {
      if (closing.current) return true
      closing.current = true
      return false
    },
    cancel(close: () => void) {
      closing.current = true
      close()
    },
  }
}

/** The name, as a heading you click (or Enter on) to rename in place. Enter saves, Escape leaves it. */
export function EditableName({ workflowId, initialValue, className, readOnly }: EditableProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = useSaveField(workflowId, 'name')
  // While a save is on its way, the name it's saving.
  const shown = save.isPending && save.variables ? save.variables : initialValue
  const closed = useClosing()

  function handleStart() {
    closed.reset()
    setDraft(shown)
  }

  function handleSave() {
    if (closed.already()) return
    const next = draft?.trim() ?? ''
    setDraft(null)
    // An empty name isn't one: it stays as it was.
    if (next && next !== shown) save.mutate(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleSave()
    if (event.key === 'Escape') closed.cancel(() => setDraft(null))
  }

  if (draft !== null) {
    return (
      <input
        aria-label="Name"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        maxLength={255}
        autoFocus
        className={cn(
          'w-full min-w-0 rounded-md border border-border bg-transparent px-2 py-1 font-semibold outline-none focus:border-primary/50',
          className ?? 'text-lg',
        )}
      />
    )
  }

  if (readOnly) {
    return (
      <h1 className={cn('min-w-0 truncate px-2 py-1 font-semibold', className ?? 'text-lg')}>
        {initialValue}
      </h1>
    )
  }

  return (
    <h1 className={cn('min-w-0 font-semibold', className ?? 'text-lg')}>
      <button
        type="button"
        onClick={handleStart}
        title="Click to rename"
        className="max-w-full cursor-text truncate rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown}
      </button>
    </h1>
  )
}

/** The description, clicked (or Enter on) to edit in place; clearing it removes it. */
export function EditableDescription({
  workflowId,
  initialValue,
  className,
  readOnly,
}: EditableProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = useSaveField(workflowId, 'description')
  // While a save is on its way, the description it's saving.
  const shown = save.isPending && save.variables !== undefined ? save.variables : initialValue
  const closed = useClosing()

  function handleStart() {
    closed.reset()
    setDraft(shown)
  }

  function handleSave() {
    if (closed.already()) return
    const next = draft?.trim() ?? ''
    setDraft(null)
    // Empty is a real answer: it clears the description.
    if (next !== shown) save.mutate(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleSave()
    if (event.key === 'Escape') closed.cancel(() => setDraft(null))
  }

  if (draft !== null) {
    return (
      <input
        aria-label="Description"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder="Add a description..."
        maxLength={1000}
        autoFocus
        className={cn(
          'w-full rounded-md border border-border bg-transparent px-2 py-0.5 text-muted-foreground outline-none focus:border-primary/50',
          className ?? 'mt-1 text-sm',
        )}
      />
    )
  }

  if (readOnly) {
    if (!initialValue) return null
    return (
      <p className={cn('px-2 py-0.5 text-muted-foreground', className ?? 'mt-1 text-sm')}>
        {initialValue}
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      title="Click to edit the description"
      className={cn(
        'block w-fit max-w-full cursor-text rounded-md px-2 py-0.5 text-left text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className ?? 'mt-1 text-sm',
      )}
    >
      {shown || <span className="italic text-muted-foreground/40">Add a description...</span>}
    </button>
  )
}
