import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder,
  FolderInput,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { dirname, rowKey, type TreeRow } from '../../lib/ide/file-tree'
import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { FileIcon, roleTitle } from './file-icon'
import { NewMenuItems, type NewMenuItemsProps } from './new-menu-items'

interface Point {
  x: number
  y: number
}

export interface RowActions {
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onConvert: (path: string) => void
  onNewFileIn: (dir: string) => void
  onDeleteFolder: (dir: string) => void
}

/** What the Project row's right-click menu adds: the same choices as the header's New… menu. */
export type ProjectNewMenu = NewMenuItemsProps

interface ExplorerRowProps {
  row: TreeRow
  /** The one row in the tab order. */
  tabbable: boolean
  active: boolean
  selected: boolean
  dirty: boolean
  virtual: boolean
  /** A step's source, or the `steps/` folder: no file menu, and the title says why. */
  step: boolean
  actions?: RowActions
  /** Set when the project can be added to; the Project row opens it on right-click. */
  newMenu?: ProjectNewMenu
  menuOpen: boolean
  onMenuOpenChange: (key: string, open: boolean) => void
  onActivate: (row: TreeRow) => void
  onFocusRow: (key: string) => void
}

export function ExplorerRow(props: ExplorerRowProps) {
  const { row, tabbable, active, selected, dirty, virtual, step, actions } = props
  const { onActivate, onFocusRow } = props
  // Where a right-click landed: the menu opens there instead of under the ⋯ button.
  const [point, setPoint] = useState<Point | null>(null)

  function handleClick() {
    onActivate(row)
  }

  // Right-click opens the row's own menu, the one its ⋯ button and ⇧F10 open.
  // Rows with no menu (sections, generated files, virtual seeds) keep the browser's.
  function handleContextMenu(event: React.MouseEvent) {
    if (!hasMenu) return
    event.preventDefault()
    event.stopPropagation()
    setPoint({ x: event.clientX, y: event.clientY })
    props.onMenuOpenChange(row.key, true)
  }

  function handleMenuOpenChange(key: string, open: boolean) {
    if (!open) setPoint(null)
    props.onMenuOpenChange(key, open)
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    // Focus moving between a row and its menu button is not a new row.
    if (event.target === event.currentTarget) onFocusRow(row.key)
  }

  const isFile = row.kind === 'file'
  const hasProjectMenu = row.kind === 'section' && row.section === 'project' && !!props.newMenu
  const hasMenu =
    hasProjectMenu ||
    (!!actions &&
      row.section === 'project' &&
      !step &&
      ((isFile && (!virtual || row.path === PROJECT_HANDLERS_PATH)) ||
        (row.kind === 'dir' && row.editable)))
  const isSection = row.kind === 'section'
  const Chevron = row.expanded ? ChevronDown : ChevronRight
  const FolderIcon = row.expanded ? FolderOpen : Folder
  const title = isFile
    ? [
        row.path,
        roleTitle(row.node!.role),
        virtual && 'From the workflow settings. Save it to make it a project file',
        dirty && 'Unsaved changes',
      ]
        .filter(Boolean)
        .join(' · ')
    : step
      ? 'Step code belongs to its node. Add, rename or remove steps on the canvas.'
      : undefined

  return (
    <div
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      data-row-key={row.key}
      aria-level={row.depth + 1}
      aria-expanded={isFile ? undefined : row.expanded}
      aria-selected={isFile ? active || selected : undefined}
      title={title}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onFocus={handleFocus}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-1 pr-1 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary',
        isSection
          ? 'h-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground'
          : 'h-6 text-xs',
        !isSection &&
          (selected
            ? 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]'
            : active
              ? 'bg-muted/70 text-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'),
      )}
      style={isSection ? undefined : { paddingLeft: `${8 + row.depth * 12 + (isFile ? 16 : 0)}px` }}
    >
      {isSection ? (
        <>
          <Chevron className="h-3 w-3 shrink-0" />
          <span>{row.name}</span>
          {hasProjectMenu && props.newMenu && (
            <ProjectMenu
              menu={props.newMenu}
              open={props.menuOpen}
              point={point}
              rowKey={row.key}
              onOpenChange={handleMenuOpenChange}
            />
          )}
          {row.section === 'generated' && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
              <Lock className="h-2.5 w-2.5" />
              read-only
            </span>
          )}
        </>
      ) : isFile ? (
        <>
          <FileIcon role={row.node!.role} />
          <span className={cn('min-w-0 flex-1 truncate', virtual && 'italic')}>{row.name}</span>
          {dirty && (
            <span
              aria-label="Unsaved changes"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning"
            />
          )}
          {hasMenu && actions && (
            <RowMenu
              path={row.path}
              actions={actions}
              virtual={virtual}
              open={props.menuOpen}
              point={point}
              onOpenChange={handleMenuOpenChange}
              rowKey={row.key}
            />
          )}
        </>
      ) : (
        <>
          <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" />
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          {hasMenu && actions && (
            <FolderMenu
              path={row.path}
              actions={actions}
              open={props.menuOpen}
              point={point}
              onOpenChange={handleMenuOpenChange}
              rowKey={row.key}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * What the menu hangs from: the row's ⋯ button, or, after a right-click, an
 * invisible point at the cursor. Clicking ⋯ never opens the row.
 */
function MenuAnchor({ path, point }: { path: string; point: Point | null }) {
  function handleClick(event: React.MouseEvent) {
    event.stopPropagation()
  }

  return (
    <DropdownMenuTrigger asChild>
      {point ? (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: point.x, top: point.y }}
        />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Actions for ${path}`}
          onClick={handleClick}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted/70 hover:text-foreground focus:opacity-100 group-focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
    </DropdownMenuTrigger>
  )
}

/** The Project row's menu: at the cursor, since the row has no ⋯ button. */
function ProjectMenu({
  menu,
  rowKey,
  open,
  point,
  onOpenChange,
}: {
  menu: ProjectNewMenu
  rowKey: string
  open: boolean
  point: Point | null
  onOpenChange: (key: string, open: boolean) => void
}) {
  function handleOpenChange(next: boolean) {
    onOpenChange(rowKey, next)
  }

  // The choices open a name field; Radix must not take focus back from it.
  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <DropdownMenu open={open && point !== null} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: point?.x ?? 0, top: point?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[200px]"
        onCloseAutoFocus={handleMenuCloseAutoFocus}
      >
        <NewMenuItems {...menu} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowMenu({
  path,
  rowKey,
  actions,
  virtual,
  open,
  point,
  onOpenChange,
}: {
  path: string
  rowKey: string
  actions: RowActions
  virtual: boolean
  open: boolean
  point: Point | null
  onOpenChange: (key: string, open: boolean) => void
}) {
  function handleOpenChange(next: boolean) {
    onOpenChange(rowKey, next)
  }

  function handleRename() {
    actions.onRename(path)
  }

  function handleDelete() {
    actions.onDelete(path)
  }

  function handleConvert() {
    actions.onConvert(path)
  }

  // The annotation file (stored or still a virtual seed) can be split into
  // handler modules; a virtual seed has nothing to rename or delete.
  const convertible = path === PROJECT_HANDLERS_PATH

  // Focus stays on the row (the tree's key handler lives there), not the hidden button.
  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <MenuAnchor path={path} point={point} />
      <DropdownMenuContent
        align={point ? 'start' : 'end'}
        className="min-w-[140px]"
        onCloseAutoFocus={handleMenuCloseAutoFocus}
      >
        {convertible && (
          <DropdownMenuItem onSelect={handleConvert} className="text-xs">
            <FolderInput className="h-3.5 w-3.5" />
            Convert to handler modules
          </DropdownMenuItem>
        )}
        {!virtual && (
          <>
            <DropdownMenuItem onSelect={handleRename} className="text-xs">
              <Pencil className="h-3.5 w-3.5" />
              Rename…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDelete} className="text-xs text-status-error">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FolderMenu({
  path,
  rowKey,
  actions,
  open,
  point,
  onOpenChange,
}: {
  path: string
  rowKey: string
  actions: RowActions
  open: boolean
  point: Point | null
  onOpenChange: (key: string, open: boolean) => void
}) {
  function handleOpenChange(next: boolean) {
    onOpenChange(rowKey, next)
  }

  function handleNewFile() {
    actions.onNewFileIn(path)
  }

  function handleDelete() {
    actions.onDeleteFolder(path)
  }

  // New file hands focus to the name field, so Radix must not take it back.
  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <MenuAnchor path={path} point={point} />
      <DropdownMenuContent
        align={point ? 'start' : 'end'}
        className="min-w-[140px]"
        onCloseAutoFocus={handleMenuCloseAutoFocus}
      >
        <DropdownMenuItem onSelect={handleNewFile} className="text-xs">
          <FilePlus className="h-3.5 w-3.5" />
          New file…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleDelete} className="text-xs text-status-error">
          <Trash2 className="h-3.5 w-3.5" />
          Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Row keys of a project folder and every folder above it. */
export function ancestorKeys(path: string): string[] {
  const keys: string[] = []
  for (let dir = path; dir; dir = dirname(dir)) keys.push(rowKey('project', dir))
  return keys
}

export function ProjectEmptyState({
  canEdit,
  onCreate,
}: {
  canEdit: boolean
  onCreate: () => void
}) {
  return (
    <div className="px-5 py-2 text-[11px] leading-relaxed text-muted-foreground">
      No project files yet.
      {canEdit && (
        <>
          {' '}
          <button
            type="button"
            onClick={onCreate}
            className="text-primary underline-offset-2 hover:underline"
          >
            Create one
          </button>{' '}
          and import it anywhere as <code className="font-mono">#app/…</code>.
        </>
      )}
    </div>
  )
}

/** Shown in place of the generated files while there is no saved version to generate them from. */
export function GeneratedEmptyState() {
  return (
    <div className="px-5 py-2 text-[11px] leading-relaxed text-muted-foreground">
      Appears after the first save on the canvas.
    </div>
  )
}
