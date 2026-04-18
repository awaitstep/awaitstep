import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { validateIR } from '@awaitstep/ir'
import type { WorkflowIR } from '@awaitstep/ir'
import { Button } from '../ui/button'
import { CodeEditor } from '../ui/code-editor'
import { api } from '../../lib/api-client'
import { toast } from 'sonner'

type InputMode = 'paste' | 'file'

function parseAndValidate(
  raw: string,
): { ir: WorkflowIR; errors: null } | { ir: null; errors: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ir: null, errors: ['Invalid JSON — check for syntax errors.'] }
  }

  const result = validateIR(parsed)
  if (!result.ok) {
    return {
      ir: null,
      errors: result.errors.map((e) => `${e.path}: ${e.message}`),
    }
  }

  return { ir: result.value, errors: null }
}

export function ImportWorkflowDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<InputMode>('paste')
  const [jsonText, setJsonText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [validIR, setValidIR] = useState<WorkflowIR | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function applyValidation(raw: string) {
    if (!raw.trim()) {
      setValidIR(null)
      setErrors([])
      setName('')
      return
    }
    const result = parseAndValidate(raw)
    if (result.errors) {
      setValidIR(null)
      setErrors(result.errors)
      setName('')
    } else {
      setValidIR(result.ir)
      setErrors([])
      setName(result.ir.metadata.name)
    }
  }

  function clearState() {
    setJsonText('')
    setFileName(null)
    setValidIR(null)
    setErrors([])
    setName('')
  }

  function switchMode(next: InputMode) {
    if (next === mode) return
    clearState()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setMode(next)
  }

  function handlePasteChange(value: string) {
    setJsonText(value)
    applyValidation(value)
  }

  function loadFile(file: File) {
    if (!file.name.endsWith('.json')) {
      setErrors(['Please select a .json file.'])
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setJsonText(text)
      setFileName(file.name)
      applyValidation(text)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setMode('file')
      loadFile(file)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!validIR) throw new Error('No valid IR')
      const workflow = await api.createWorkflow({
        name: name.trim() || validIR.metadata.name,
        description: validIR.metadata.description,
      })
      await api.createVersion(workflow.id, { ir: validIR })
      return workflow
    },
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate({
        to: '/workflows/$workflowId/canvas',
        params: { workflowId: workflow.id },
      }).finally(() => {
        toast.success('Workflow imported')
        onClose()
      })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to import workflow')
    },
  })

  const hasInput = jsonText.trim().length > 0
  const canImport = validIR !== null && !importMutation.isPending

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
        >
          <Dialog.Title className="text-base font-semibold text-foreground">
            Import Workflow
          </Dialog.Title>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste an IR JSON document or upload an exported <code>.ir.json</code> file.
          </p>

          {/* Mode tabs */}
          <div className="mt-4 flex gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            <button
              onClick={() => switchMode('paste')}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'paste'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground/60'
              }`}
            >
              Paste JSON
            </button>
            <button
              onClick={() => switchMode('file')}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'file'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground/60'
              }`}
            >
              Upload file
            </button>
          </div>

          {/* Input area */}
          <div className="mt-3">
            {mode === 'paste' ? (
              <CodeEditor
                value={jsonText}
                onChange={handlePasteChange}
                language="json"
                height="288px"
                expandable={false}
              />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${
                  isDragOver
                    ? 'border-primary/60 bg-primary/5'
                    : fileName
                      ? 'border-border bg-muted/20'
                      : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                {fileName ? (
                  <>
                    <FileText className="h-8 w-8 text-primary/60" />
                    <span className="mt-2 text-sm font-medium text-foreground">{fileName}</span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      Click to choose a different file
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/40" />
                    <span className="mt-2 text-sm text-muted-foreground">
                      Drop a file here or click to browse
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground/60">
                      .json files only
                    </span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) loadFile(file)
                  }}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Validation errors */}
          {hasInput && errors.length > 0 && (
            <div className="mt-3 max-h-28 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <div className="space-y-1">
                  {errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      {err}
                    </p>
                  ))}
                  {errors.length > 5 && (
                    <p className="text-xs text-destructive/70">
                      ...and {errors.length - 5} more errors
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Workflow name (shown when IR is valid) */}
          {validIR && (
            <div className="mt-3">
              <label className="text-xs font-medium text-foreground/60">Workflow name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {validIR.nodes.length} nodes, {validIR.edges.length} edges
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canImport} onClick={() => importMutation.mutate()}>
              {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Import
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
