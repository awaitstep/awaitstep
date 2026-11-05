import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Upload } from 'lucide-react'
import { useImportItem } from '../../data/dashboard/items'
import { useDataSource } from '../../data/dashboard/source'
import { itemPath, workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { MAX_IMPORT_BYTES, TOO_LARGE } from '../../lib/workflows/import-file'
import type { WorkspaceItem } from '../../types/dashboard/items'
import { useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'

interface ImportItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slugs: WorkspaceSlugs
}

/**
 * Import: an exported workflow file becomes a draft in this workspace (D-P2-2).
 * On the real backend it opens in the editor; sample items have no editor, so
 * the dialog closes (or says where a function went) instead.
 */
export function ImportItemDialog({ open, onOpenChange, slugs }: ImportItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const opensEditor = useDataSource() === 'api'
  const importItem = useImportItem(slugs, { onImported: opensEditor ? openImported : undefined })
  const [file, setFile] = useState<File | null>(null)
  // A function export lands on Functions, not on the Workflows list behind
  // the dialog, so the dialog stays to say where it went.
  const [importedFunction, setImportedFunction] = useState<WorkspaceItem | null>(null)
  const [tooLarge, setTooLarge] = useState(false)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setTooLarge(false)
    importItem.reset()
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setTooLarge(true)
      return
    }
    const content = await file.text()
    importItem.mutate(
      { fileName: file.name, content },
      { onSuccess: opensEditor ? undefined : handleImported },
    )
  }

  function openImported(item: WorkspaceItem) {
    goTo(itemPath(slugs, item))
  }

  function handleImported(item: WorkspaceItem) {
    if (item.kind === 'script') setImportedFunction(item)
    else onOpenChange(false)
  }

  function handleCancel() {
    onOpenChange(false)
  }

  const importDisabled = !file || importItem.isPending
  const actions = importedFunction ? (
    <Button type="button" onClick={handleCancel}>
      Done
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={importDisabled}>
        Import
      </Button>
    </>
  )

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      leading={
        <Tile tone="info" size="lg">
          <Upload />
        </Tile>
      }
      title="Import a workflow"
      description="Import an exported workflow. It’s added as a draft."
      actions={actions}
    >
      {importedFunction ? (
        <p role="status" className="text-sm text-foreground/90">
          That file was a function, so <strong>{importedFunction.name}</strong> is a draft under{' '}
          <ShellLink href={workspacePath(slugs, 'functions')} className="underline">
            Functions
          </ShellLink>
          , not Workflows.
        </p>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5">
          <FormField
            label="Workflow file"
            hint="A .json file exported from AwaitStep."
            error={tooLarge ? TOO_LARGE : importItem.error?.message}
            required
          >
            <Input type="file" accept=".json,application/json" onChange={handleFileChange} />
          </FormField>
        </form>
      )}
    </ModalDialog>
  )
}
