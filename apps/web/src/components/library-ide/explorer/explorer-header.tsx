import { Plus } from 'lucide-react'
import type { LibraryKind } from '../../../lib/library-api'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { keepFocusOnField } from './focus-name-field'

/** The tree's header: "Files" and, for those who may, Add (a module or a node). */
export function ExplorerHeader({
  placeName,
  canCreate,
  onNewItem,
}: {
  placeName: string
  canCreate: boolean
  onNewItem: (kind: LibraryKind) => void
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
      <span className="flex-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Files
      </span>
      {canCreate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add"
              className="size-6 text-muted-foreground"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={keepFocusOnField}>
            <DropdownMenuLabel>Add to {placeName}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onNewItem('module')}>
              New module{' '}
              <span className="ml-auto text-2xs text-muted-foreground">
                index.ts + package.json
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewItem('node')}>
              New node{' '}
              <span className="ml-auto text-2xs text-muted-foreground">
                node.json + template.ts
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
