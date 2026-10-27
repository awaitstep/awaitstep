import { Boxes, Package } from 'lucide-react'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { DOCS_URL } from '../navigation/nav-model'

export type LibraryExplainer = 'module' | 'resource'

const EXPLAINERS: Record<
  LibraryExplainer,
  { title: string; body: string; tone: 'ok' | 'info'; icon: typeof Package }
> = {
  module: {
    title: 'New module',
    tone: 'ok',
    icon: Package,
    body: 'A module is code your workflows import as #modules/<name>. You publish versions, and each workflow pins the one it uses.',
  },
  resource: {
    title: 'New resource',
    tone: 'info',
    icon: Boxes,
    body: 'A resource is a node you write: it shows in the canvas palette for this workspace, next to the org’s installed nodes.',
  },
}

interface LibraryExplainerDialogProps {
  kind: LibraryExplainer
  /** Overrides the kind's title, e.g. "New project module". */
  title?: string
  onClose: () => void
}

/**
 * What New module / New resource will make, until modules land (W2,
 * D-P2-7): the Library page and the project's Shared library open it.
 */
export function LibraryExplainerDialog({ kind, title, onClose }: LibraryExplainerDialogProps) {
  const shown = EXPLAINERS[kind]

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone={shown.tone} size="lg">
          <shown.icon />
        </Tile>
      }
      title={title ?? shown.title}
      description="Coming with modules"
      actions={
        <Button type="button" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-foreground/90">{shown.body}</p>
      <p className="text-xs text-muted-foreground">
        Creating them arrives with modules.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline">
          Read about modules in the docs ↗
        </a>
      </p>
    </ModalDialog>
  )
}
