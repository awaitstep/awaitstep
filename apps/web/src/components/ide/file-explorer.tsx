import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { useShallow } from 'zustand/react/shallow'
import type { TreeNode } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'
import { FileIcon, roleTitle } from './file-icon'

interface FileExplorerProps {
  project: TreeNode[]
  generated: TreeNode[]
  dirty: ReadonlySet<string>
  /** Project files surfaced from legacy settings that are not stored yet. */
  virtual: ReadonlySet<string>
  canEdit: boolean
  onNewFile: () => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  /** Splits the annotation file into handler modules. */
  onConvert: (path: string) => void
}

interface RowActions {
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onConvert: (path: string) => void
}

export function FileExplorer({
  project,
  generated,
  dirty,
  virtual,
  canEdit,
  onNewFile,
  onRename,
  onDelete,
  onConvert,
}: FileExplorerProps) {
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  // Directories and sections start expanded; only what the user folds is
  // tracked, so a refreshed tree never hides freshly added folders.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  function handleToggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rowActions: RowActions | undefined = canEdit ? { onRename, onDelete, onConvert } : undefined

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Explorer
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onNewFile}
            title="New file"
            aria-label="New file"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1" role="tree">
        <Section
          id="project"
          label="Project"
          collapsed={collapsed.has('section:project')}
          onToggle={handleToggle}
        >
          {project.length === 0 ? (
            <ProjectEmptyState canEdit={canEdit} onNewFile={onNewFile} />
          ) : (
            <TreeRows
              nodes={project}
              depth={1}
              collapsed={collapsed}
              activePath={activePath}
              dirty={dirty}
              virtual={virtual}
              actions={rowActions}
              onToggleDir={handleToggle}
              onOpenFile={openFile}
            />
          )}
        </Section>
        <Section
          id="generated"
          label="Generated"
          hint="read-only"
          collapsed={collapsed.has('section:generated')}
          onToggle={handleToggle}
        >
          <TreeRows
            nodes={generated}
            depth={1}
            collapsed={collapsed}
            activePath={activePath}
            dirty={dirty}
            virtual={virtual}
            onToggleDir={handleToggle}
            onOpenFile={openFile}
          />
        </Section>
      </div>
    </div>
  )
}

function Section({
  id,
  label,
  hint,
  collapsed,
  onToggle,
  children,
}: {
  id: string
  label: string
  hint?: string
  collapsed: boolean
  onToggle: (key: string) => void
  children: React.ReactNode
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown

  function handleClick() {
    onToggle(`section:${id}`)
  }

  return (
    <div className="pb-1">
      <button
        type="button"
        onClick={handleClick}
        className="flex h-6 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <Chevron className="h-3 w-3 shrink-0" />
        <span>{label}</span>
        {hint && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50">
            <Lock className="h-2.5 w-2.5" />
            {hint}
          </span>
        )}
      </button>
      {!collapsed && children}
    </div>
  )
}

function ProjectEmptyState({ canEdit, onNewFile }: { canEdit: boolean; onNewFile: () => void }) {
  return (
    <div className="px-5 py-2 text-[11px] leading-relaxed text-muted-foreground/60">
      No project files yet.
      {canEdit && (
        <>
          {' '}
          <button
            type="button"
            onClick={onNewFile}
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

interface TreeRowsProps {
  nodes: TreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  activePath: string | null
  dirty: ReadonlySet<string>
  virtual: ReadonlySet<string>
  actions?: RowActions
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
}

function TreeRows(props: TreeRowsProps) {
  const { nodes, depth, activePath, dirty, virtual, actions, onOpenFile } = props
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow key={node.path} {...props} node={node} />
        ) : (
          <FileRow
            key={node.path}
            node={node}
            depth={depth}
            active={node.path === activePath}
            dirty={dirty.has(node.path)}
            virtual={virtual.has(node.path)}
            actions={actions}
            onOpenFile={onOpenFile}
          />
        ),
      )}
    </>
  )
}

function rowIndent(depth: number) {
  return { paddingLeft: `${8 + depth * 12}px` }
}

function DirRow({ node, ...rows }: TreeRowsProps & { node: Extract<TreeNode, { kind: 'dir' }> }) {
  const isCollapsed = rows.collapsed.has(node.path)
  const Chevron = isCollapsed ? ChevronRight : ChevronDown
  const FolderIcon = isCollapsed ? Folder : FolderOpen

  function handleClick() {
    rows.onToggleDir(node.path)
  }

  return (
    <div role="treeitem" aria-expanded={!isCollapsed}>
      <button
        type="button"
        onClick={handleClick}
        className="flex h-6 w-full items-center gap-1 pr-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        style={rowIndent(rows.depth)}
      >
        <Chevron className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        <span className="truncate">{node.name}</span>
      </button>
      {!isCollapsed && <TreeRows {...rows} nodes={node.children} depth={rows.depth + 1} />}
    </div>
  )
}

function FileRow({
  node,
  depth,
  active,
  dirty,
  virtual,
  actions,
  onOpenFile,
}: {
  node: Extract<TreeNode, { kind: 'file' }>
  depth: number
  active: boolean
  dirty: boolean
  virtual: boolean
  actions?: RowActions
  onOpenFile: (path: string) => void
}) {
  function handleClick() {
    onOpenFile(node.path)
  }

  const title = [
    node.path,
    roleTitle(node.role),
    virtual && 'From the workflow settings. Save it to make it a project file',
    dirty && 'Unsaved changes',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="treeitem"
      aria-selected={active}
      className={cn(
        'group flex h-6 w-full items-center gap-1.5 pr-1 text-xs transition-colors',
        active
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      <button
        type="button"
        onClick={handleClick}
        title={title}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <FileIcon role={node.role} />
        <span className={cn('truncate', virtual && 'italic')}>{node.name}</span>
        {dirty && (
          <span
            aria-label="Unsaved changes"
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning"
          />
        )}
      </button>
      {actions && (!virtual || node.path === PROJECT_HANDLERS_PATH) && (
        <RowMenu path={node.path} actions={actions} virtual={virtual} />
      )}
    </div>
  )
}

function RowMenu({
  path,
  actions,
  virtual,
}: {
  path: string
  actions: RowActions
  virtual: boolean
}) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${path}`}
          onClick={(event) => event.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted/70 hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
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
