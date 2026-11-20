import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { ApiLibraryTreeItem, LibraryKind } from '../../../lib/library-api'
import type { LibraryRoot } from '../../../lib/library/explorer-tree'
import { itemRoot } from '../../../lib/library/ide-index'
import { Button } from '../../ui/button'
import { LibraryKindTile } from '../../library/parts/library-kind-tile'
import { ExplorerLine } from './explorer-line'
import { itemMenu } from './explorer-menus'
import { CreateRowIn, ExplorerNode, type TreeContext } from './explorer-node'
import { NewItemRow } from './new-item-row'

export const ROOT_LABEL: Record<LibraryKind, string> = { module: 'modules', node: 'nodes' }
const NEW_LABEL: Record<LibraryKind, string> = { module: 'New module', node: 'New node' }

interface ExplorerRootProps {
  root: LibraryRoot
  ctx: TreeContext
  canCreate: boolean
  activeItemId: string | null
  onSelectItem: (id: string) => void
}

/** `/modules` or `/nodes` (28d): collapsible, with its `+`, the new-item row and each item's tree. */
export function ExplorerRoot({
  root,
  ctx,
  canCreate,
  activeItemId,
  onSelectItem,
}: ExplorerRootProps) {
  const { state } = ctx
  const open = state.isOpen(root.path)
  const naming = state.editing?.kind === 'new-item' && state.editing.itemKind === root.kind

  function handleItemClick(item: ApiLibraryTreeItem) {
    onSelectItem(item.id)
    state.toggle(itemRoot(item))
  }

  return (
    <div>
      <div className="group flex h-7 items-center gap-1 pr-3 pl-2 text-xs text-foreground/90">
        <button
          type="button"
          onClick={() => state.toggle(root.path)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-mono font-medium"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          {ROOT_LABEL[root.kind]}
        </button>
        {canCreate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`New in ${ROOT_LABEL[root.kind]}`}
            title={NEW_LABEL[root.kind]}
            onClick={() => state.beginNewItem(root.kind)}
            className="size-6 text-muted-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {open && canCreate && naming && (
        <NewItemRow kind={root.kind} onSubmit={state.submitNewItem} onCancel={state.stopEditing} />
      )}
      {open && root.items.length === 0 && !naming && (
        <p className="px-6 py-1 text-2xs text-muted-foreground">Nothing here yet.</p>
      )}
      {open &&
        root.items.map(({ item, children }) => {
          const path = itemRoot(item)
          const itemOpen = state.isOpen(path)
          return (
            <div key={item.id}>
              <ExplorerLine
                label={item.slug}
                depth={1}
                open={itemOpen}
                active={item.id === activeItemId && filePathIsOutside(ctx.activePath, path)}
                icon={
                  <LibraryKindTile
                    kind={item.kind}
                    className="size-4 rounded text-2xs leading-none"
                  />
                }
                title={item.name}
                menu={itemMenu(item, ctx)}
                onClick={() => handleItemClick(item)}
              />
              {itemOpen && <CreateRowIn folder={path} depth={2} ctx={ctx} />}
              {itemOpen &&
                children.map((child) => (
                  <ExplorerNode key={child.path} node={child} depth={2} ctx={ctx} />
                ))}
            </div>
          )
        })}
    </div>
  )
}

/** The item row reads as selected while no file of it is the active tab. */
function filePathIsOutside(activePath: string | null, root: string): boolean {
  return activePath === null || !activePath.startsWith(`${root}/`)
}
