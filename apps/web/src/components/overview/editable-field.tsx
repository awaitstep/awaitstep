import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api-client'

export function EditableName({ workflowId, initialValue }: { workflowId: string; initialValue: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => { setValue(initialValue) }, [initialValue])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const mutation = useMutation({
    mutationFn: (name: string) => api.updateWorkflow(workflowId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const save = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (!trimmed || trimmed === initialValue) {
      setValue(initialValue)
      return
    }
    mutation.mutate(trimmed)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initialValue); setEditing(false) } }}
        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-lg font-semibold outline-none focus:border-primary/50"
      />
    )
  }

  return (
    <h1
      onClick={() => setEditing(true)}
      className="cursor-text rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-muted/40"
      title="Click to edit"
    >
      {initialValue}
    </h1>
  )
}

export function EditableDescription({ workflowId, initialValue }: { workflowId: string; initialValue: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => { setValue(initialValue) }, [initialValue])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const mutation = useMutation({
    mutationFn: (description: string) => api.updateWorkflow(workflowId, { description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const save = () => {
    setEditing(false)
    if (value.trim() === initialValue) {
      setValue(initialValue)
      return
    }
    mutation.mutate(value.trim())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initialValue); setEditing(false) } }}
        placeholder="Add a description..."
        className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-0.5 text-sm text-muted-foreground outline-none focus:border-primary/50"
      />
    )
  }

  return (
    <p
      onClick={() => setEditing(true)}
      className="mt-1 cursor-text rounded-md px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
      title="Click to edit"
    >
      {initialValue || <span className="italic text-muted-foreground/40">Add a description...</span>}
    </p>
  )
}
