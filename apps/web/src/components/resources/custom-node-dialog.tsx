import { Puzzle } from 'lucide-react'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { DOCS_URL } from '../navigation/nav-model'

interface CustomNodeDialogProps {
  orgName: string
  onClose: () => void
}

/** Resources → New custom node: what one is, until writing them moves here (D-P7-4). */
export function CustomNodeDialog({ orgName, onClose }: CustomNodeDialogProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="info" size="lg">
          <Puzzle />
        </Tile>
      }
      title="New custom node"
      description="Written in the workflow editor"
      actions={
        <Button type="button" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-foreground/90">
        A custom node is a step {orgName} writes once: it shows in every project’s palette next to
        the marketplace nodes, and each workflow pins the version it uses.
      </p>
      <p className="text-xs text-muted-foreground">
        You write and publish them from the workflow editor; they appear here once published.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline">
          Read about custom nodes in the docs ↗
        </a>
      </p>
    </ModalDialog>
  )
}
