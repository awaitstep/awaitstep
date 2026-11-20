import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Upload } from 'lucide-react'
import { useImportItem } from '../../data/dashboard/items'
import { itemPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { MAX_IMPORT_BYTES, TOO_LARGE } from '../../lib/workflows/import-file'
import type { WorkspaceItem } from '../../types/dashboard/items'
import { useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'

interface ImportItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slugs: WorkspaceSlugs
}

/** Import: an exported workflow file becomes a draft in this workspace (D-P2-2), opened in the editor. */
export function ImportItemDialog({ open, onOpenChange, slugs }: ImportItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const importItem = useImportItem(slugs, { onImported: openImported })
  const [file, setFile] = useState<File | null>(null)
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
    importItem.mutate({ fileName: file.name, content })
  }

  function openImported(item: WorkspaceItem) {
    goTo(itemPath(slugs, item))
  }

  function handleCancel() {
    onOpenChange(false)
  }

  const importDisabled = !file || importItem.isPending
  const actions = (
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
    </ModalDialog>
  )
}
