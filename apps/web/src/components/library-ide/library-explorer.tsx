import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { TreeNode } from '../../lib/ide/file-tree'
import type { ApiLibraryTreeItem, LibraryKind } from '../../lib/library-api'
import { draftFolderOf, itemRoot, type LibraryIdeIndex } from '../../lib/library/ide-index'
import { libraryRoots } from '../../lib/library/explorer-tree'
import { useIdeStore } from '../../stores/ide-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { LibraryKindTile } from '../library/parts/library-kind-tile'
import { ExplorerLine, fileIconOf, type RowMenuItem } from './library-explorer-rows'

export type ItemAction = 'rename' | 'duplicate' | 'history' | 'new-version' | 'delete'

interface LibraryExplorerProps {
  index: LibraryIdeIndex
  placeName: string
  dirty: ReadonlySet<string>
  activeItemId: string | null
  canEdit: boolean
  canCreate: boolean
  onNewItem: (kind: LibraryKind) => void
  onSelectItem: (id: string) => void
  onItemAction: (action: ItemAction, item: ApiLibraryTreeItem) => void
  onNewFile: (folder: string) => void
  onRenameFile: (path: string) => void
  onDeleteFile: (path: string) => void
}

const ROOT_LABEL: Record<LibraryKind, string> = { module: '/modules', node: '/nodes' }
const NEW_LABEL: Record<LibraryKind, string> = { module: 'New module', node: 'New node' }

/**
 * The Library IDE's Files tree (28d/28f): `/modules` and `/nodes`, each
 * item a folder. Add lives on the header and on each root; an item's menu
 * renames, duplicates, starts a new version, shows history or deletes it.
 */
export function LibraryExplorer(props: LibraryExplorerProps) {
  const { index, placeName, dirty, activeItemId, canEdit, canCreate, onNewItem } = props
  const roots = useMemo(() => libraryRoots(index), [index])
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function itemMenu(item: ApiLibraryTreeItem): RowMenuItem[] {
    const menu: RowMenuItem[] = [
      { label: 'Version history', onSelect: () => props.onItemAction('history', item) },
    ]
    if (!canEdit) return menu
    if (item.kind === 'node' && item.latestVersion !== null && draftFolderOf(item) === null) {
      menu.unshift({
        label: 'New version',
        onSelect: () => props.onItemAction('new-version', item),
      })
    }
    menu.push(
      // At the item's root: any file for a module, the icon for a node.
      { label: 'New file', onSelect: () => props.onNewFile(itemRoot(item)) },
      { label: 'Rename', onSelect: () => props.onItemAction('rename', item) },
      { label: 'Duplicate', onSelect: () => props.onItemAction('duplicate', item) },
      { label: 'Delete', onSelect: () => props.onItemAction('delete', item), danger: true },
    )
    return menu
  }

  function folderMenu(path: string, readOnly: boolean): RowMenuItem[] {
    if (!canEdit || readOnly) return []
    return [{ label: 'New file', onSelect: () => props.onNewFile(path) }]
  }

  function fileMenu(path: string): RowMenuItem[] {
    const listed = index.files.get(path)
    if (!canEdit || !listed || listed.readOnly) return []
    return [
      { label: 'Rename', onSelect: () => props.onRenameFile(path) },
      { label: 'Delete', onSelect: () => props.onDeleteFile(path), danger: true },
    ]
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.kind === 'file') {
      const readOnly = index.files.get(node.path)?.readOnly ?? false
      return (
        <ExplorerLine
          key={node.path}
          label={node.name}
          depth={depth}
          active={activePath === node.path}
          dirty={dirty.has(node.path)}
          muted={readOnly}
          title={readOnly ? 'Published: read-only' : undefined}
          icon={fileIconOf(node)}
          menu={fileMenu(node.path)}
          onClick={() => openFile(node.path)}
        />
      )
    }
    const open = !collapsed.has(node.path)
    const readOnly = node.children.every(
      (child) => child.kind === 'file' && (index.files.get(child.path)?.readOnly ?? false),
    )
    return (
      <div key={node.path}>
        <ExplorerLine
          label={node.name}
          depth={depth}
          open={open}
          muted={readOnly}
          title={readOnly ? 'Published: read-only' : undefined}
          menu={folderMenu(node.path, readOnly)}
          onClick={() => toggle(node.path)}
        />
        {open && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  function handleItemClick(item: ApiLibraryTreeItem) {
    props.onSelectItem(item.id)
    toggle(itemRoot(item))
  }

  return (
    <nav aria-label="Files" className="flex h-full min-h-0 flex-col bg-card">
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
            <DropdownMenuContent align="end">
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
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {roots.map((root) => (
          <div key={root.path}>
            <div className="group flex h-7 items-center gap-1 px-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">{ROOT_LABEL[root.kind]}</span>
              {canCreate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`New in ${ROOT_LABEL[root.kind]}`}
                  title={NEW_LABEL[root.kind]}
                  onClick={() => onNewItem(root.kind)}
                  className="size-5"
                >
                  <Plus className="size-3" aria-hidden="true" />
                </Button>
              )}
            </div>
            {root.items.length === 0 && (
              <p className="px-6 py-1 text-2xs text-muted-foreground">Nothing here yet.</p>
            )}
            {root.items.map(({ item, children }) => {
              const path = itemRoot(item)
              const open = !collapsed.has(path)
              return (
                <div key={item.id}>
                  <ExplorerLine
                    label={item.slug}
                    depth={1}
                    open={open}
                    active={item.id === activeItemId && filePathIsOutside(activePath, path)}
                    icon={
                      <LibraryKindTile
                        kind={item.kind}
                        className="size-4 rounded text-2xs leading-none"
                      />
                    }
                    title={item.name}
                    menu={itemMenu(item)}
                    onClick={() => handleItemClick(item)}
                  />
                  {open && children.map((child) => renderNode(child, 2))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="shrink-0 border-t border-border px-3 py-1.5 text-2xs text-muted-foreground">
        Use the ⋯ menus for more
      </p>
    </nav>
  )
}

/** The item row reads as selected while no file of it is the active tab. */
function filePathIsOutside(activePath: string | null, root: string): boolean {
  return activePath === null || !activePath.startsWith(`${root}/`)
}
