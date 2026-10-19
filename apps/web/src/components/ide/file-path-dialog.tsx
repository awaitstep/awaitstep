import { useState } from 'react'
import { newFileError, normalizeNewPath } from '../../lib/ide/project'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface FilePathDialogProps {
  open: boolean
  title: string
  description: string
  submitLabel: string
  initialPath?: string
  /** Every path the new one must not clash with (the renamed file itself excluded). */
  existingPaths: Iterable<string>
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (path: string) => void
}

/** Asks for a project-relative path and refuses anything the server would. */
export function FilePathDialog({
  open,
  title,
  description,
  submitLabel,
  initialPath = '',
  existingPaths,
  busy,
  onOpenChange,
  onSubmit,
}: FilePathDialogProps) {
  // Keyed on `open` by the caller so each showing starts from initialPath.
  const [value, setValue] = useState(initialPath)
  const error = value.trim() ? newFileError(value, existingPaths) : null
  const canSubmit = value.trim().length > 0 && !error && !busy

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(normalizeNewPath(value))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ide-file-path">Path</Label>
            <Input
              id="ide-file-path"
              autoFocus
              value={value}
              onChange={handleChange}
              placeholder="config/env.ts"
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
            />
            <p className="min-h-4 text-[11px] text-status-error">{error ?? ''}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
