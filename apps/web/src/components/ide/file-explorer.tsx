import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { TreeNode } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import { cn } from '../../lib/utils'
import { FileIcon, roleTitle } from './file-icon'

interface FileExplorerProps {
  tree: TreeNode[]
  fileCount: number
}

export function FileExplorer({ tree, fileCount }: FileExplorerProps) {
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  // Directories start expanded; only the ones the user folds are tracked, so
  // a refreshed tree never hides freshly added folders.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  function handleToggleDir(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Explorer
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          {fileCount} file{fileCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1" role="tree">
        <TreeRows
          nodes={tree}
          depth={0}
          collapsed={collapsed}
          activePath={activePath}
          onToggleDir={handleToggleDir}
          onOpenFile={openFile}
        />
      </div>
    </div>
  )
}

interface TreeRowsProps {
  nodes: TreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  activePath: string | null
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
}

function TreeRows({ nodes, depth, collapsed, activePath, onToggleDir, onOpenFile }: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow
            key={node.path}
            node={node}
            depth={depth}
            collapsed={collapsed}
            activePath={activePath}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
          />
        ) : (
          <FileRow
            key={node.path}
            node={node}
            depth={depth}
            active={node.path === activePath}
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

function DirRow({
  node,
  depth,
  collapsed,
  activePath,
  onToggleDir,
  onOpenFile,
}: Omit<TreeRowsProps, 'nodes'> & { node: Extract<TreeNode, { kind: 'dir' }> }) {
  const isCollapsed = collapsed.has(node.path)
  const Chevron = isCollapsed ? ChevronRight : ChevronDown
  const FolderIcon = isCollapsed ? Folder : FolderOpen

  function handleClick() {
    onToggleDir(node.path)
  }

  return (
    <div role="treeitem" aria-expanded={!isCollapsed}>
      <button
        type="button"
        onClick={handleClick}
        className="flex h-6 w-full items-center gap-1 pr-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        style={rowIndent(depth)}
      >
        <Chevron className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        <span className="truncate">{node.name}</span>
      </button>
      {!isCollapsed && (
        <TreeRows
          nodes={node.children}
          depth={depth + 1}
          collapsed={collapsed}
          activePath={activePath}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  )
}

function FileRow({
  node,
  depth,
  active,
  onOpenFile,
}: {
  node: Extract<TreeNode, { kind: 'file' }>
  depth: number
  active: boolean
  onOpenFile: (path: string) => void
}) {
  function handleClick() {
    onOpenFile(node.path)
  }

  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={active}
      onClick={handleClick}
      title={`${node.path} · ${roleTitle(node.role)}`}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 pr-2 text-xs transition-colors',
        active
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      <FileIcon role={node.role} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}
