import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  dirname,
  flattenTreeRows,
  focusAfterRemoval,
  rowKey,
  sectionKey,
  treeFilePaths,
  treeKeyIntent,
  type TreeIntent,
  type TreeNode,
  type TreeRow,
} from '../../lib/ide/file-tree'
import {
  resolveTargetFolder,
  usageStatus,
  type NewMenuItem,
  type ProjectUsage,
} from '../../lib/ide/project'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeExplorerStore } from '../../stores/ide-explorer-store'
import { useIdeStore } from '../../stores/ide-store'
import { CreateRow } from './file-explorer-create'
import { LimitsFooter } from './file-explorer-footer'
import { ExplorerHeader } from './file-explorer-header'
import { ExplorerRow, ProjectEmptyState, ancestorKeys, type RowActions } from './file-explorer-rows'

interface FileExplorerProps {
  /** The side bar's view switch, shown in the header. */
  tabs?: ReactNode
  project: TreeNode[]
  generated: TreeNode[]
  dirty: ReadonlySet<string>
  /** Project files surfaced from legacy settings that are not stored yet. */
  virtual: ReadonlySet<string>
  canEdit: boolean
  /** Stored project files only (virtual seeds are not counted by the server). */
  usage: ProjectUsage
  /**
   * Creates the file. Resolves to whether it was created; the caller opens it
   * at line 1 and moves focus into the editor.
   */
  onCreateFile: (path: string, source?: string) => Promise<boolean>
  onRename: (path: string) => void
  onDelete: (path: string) => void
  /** Splits the annotation file into handler modules. */
  onConvert: (path: string) => void
  /** Esc in the tree: focus goes back to the editor. */
  onEscape: () => void
}

export function FileExplorer({
  tabs,
  project,
  generated,
  dirty,
  virtual,
  canEdit,
  usage,
  onCreateFile,
  onRename,
  onDelete,
  onConvert,
  onEscape,
}: FileExplorerProps) {
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  const { selected, create, focusPath } = useIdeExplorerStore(
    useShallow((s) => ({ selected: s.selected, create: s.create, focusPath: s.focusPath })),
  )
  // Directories and sections start expanded; only what the user folds is
  // tracked, so a refreshed tree never hides freshly added folders.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [removal, setRemoval] = useState<{ key: string; next: string | null } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const existing = useMemo(() => treeFilePaths(project), [project])
  const projectPaths = useMemo(() => new Set(existing), [existing])
  const limits = usageStatus(usage)
  const target = resolveTargetFolder({ selected, activePath, projectPaths })

  const rows = useMemo(() => {
    const forceOpen = create ? new Set([sectionKey('project'), ...ancestorKeys(target)]) : undefined
    return flattenTreeRows(
      [
        { id: 'project', label: 'Project', nodes: project },
        { id: 'generated', label: 'Generated', nodes: generated },
      ],
      collapsed,
      { forceOpen, isEditable: (node) => canEdit && !virtual.has(node.path) },
    )
  }, [project, generated, collapsed, create, target, canEdit, virtual])

  const createAnchor =
    rows.find((r) => r.kind === 'dir' && r.section === 'project' && r.path === target) ??
    rows.find((r) => r.key === sectionKey('project'))
  const createTarget = createAnchor?.kind === 'dir' ? target : ''

  const activeKey = activePath ? rowKey('project', activePath) : null
  const tabKey = rows.some((r) => r.key === focusedKey)
    ? focusedKey
    : rows.some((r) => r.key === activeKey)
      ? activeKey
      : (rows[0]?.key ?? null)

  function focusRow(key: string) {
    const nodes = treeRef.current?.querySelectorAll<HTMLElement>('[data-row-key]') ?? []
    for (const node of nodes) {
      if (node.dataset.rowKey === key) {
        node.focus()
        return
      }
    }
  }

  // The tree is kept mounted but hidden while Search shows, and a hidden row
  // cannot take focus: a focus move first brings the Explorer back.
  const shown = useIdeLayoutStore((s) => s.sideBarTab === 'explorer')
  function showExplorer(): boolean {
    if (!shown) useIdeLayoutStore.getState().showSideBar('explorer')
    return shown
  }

  // Focus is a DOM side effect, so it waits for the row to exist: a renamed
  // file's row appears only after the workspace refetches.
  useEffect(() => {
    if (!focusPath) return
    const key = rowKey('project', focusPath)
    if (!rows.some((r) => r.key === key)) return
    if (!showExplorer()) return
    setFocusedKey(key)
    focusRow(key)
    useIdeExplorerStore.getState().requestFocus(null)
  }, [focusPath, rows, shown])

  useEffect(() => {
    if (!removal || rows.some((r) => r.key === removal.key)) return
    if (removal.next && !showExplorer()) return
    setRemoval(null)
    if (removal.next) {
      setFocusedKey(removal.next)
      focusRow(removal.next)
    }
  }, [removal, rows, shown])

  function toggle(key: string, open?: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      const shouldCollapse = open === undefined ? !next.has(key) : !open
      if (shouldCollapse) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function select(row: TreeRow) {
    if (row.kind === 'section') return
    useIdeExplorerStore.getState().select({
      path: row.path,
      kind: row.kind,
      section: row.section,
    })
  }

  function handleActivate(row: TreeRow) {
    if (row.kind === 'section') toggle(row.key)
    else {
      select(row)
      if (row.kind === 'dir') toggle(row.key)
      else openFile(row.path)
    }
  }

  function handleDeleteRequest(path: string) {
    const key = rowKey('project', path)
    setRemoval({ key, next: focusAfterRemoval(rows, key) })
    onDelete(path)
  }

  function applyIntent(intent: TreeIntent) {
    if (intent.type === 'escape') return onEscape()
    const row = rows.find((r) => r.key === intent.key)
    if (!row) return
    switch (intent.type) {
      case 'focus':
        setFocusedKey(intent.key)
        return focusRow(intent.key)
      case 'expand':
        return toggle(row.key, true)
      case 'collapse':
        return toggle(row.key, false)
      case 'toggle':
        return handleActivate(row)
      case 'open':
        select(row)
        return openFile(row.path)
      case 'select':
        return select(row)
      case 'rename':
        return onRename(row.path)
      case 'delete':
        return handleDeleteRequest(row.path)
      case 'menu':
        return setMenuKey(row.key)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Only the rows themselves: the name field and menus handle their own keys.
    const key = (event.target as HTMLElement).dataset.rowKey
    if (!key) return
    const intent = treeKeyIntent(rows, key, event)
    if (!intent) return
    event.preventDefault()
    applyIntent(intent)
  }

  function handleMenuOpenChange(key: string, open: boolean) {
    setMenuKey(open ? key : null)
    // Closing the menu hands focus back to its row.
    if (!open) focusRow(key)
  }

  function handleFocusRow(key: string) {
    setFocusedKey(key)
    if (removal) setRemoval(null)
  }

  async function submitCreate(path: string, source?: string): Promise<boolean> {
    const created = await onCreateFile(path, source)
    if (created) {
      const key = rowKey('project', path)
      setFocusedKey(key)
      setCollapsed((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestorKeys(dirname(path))) next.delete(ancestor)
        return next
      })
      useIdeExplorerStore.getState().select({ path, kind: 'file', section: 'project' })
      useIdeExplorerStore.getState().endCreate()
    }
    return created
  }

  function handleNewFile() {
    useIdeExplorerStore.getState().beginCreate({ mode: 'file' })
  }

  function handleNewFolder() {
    useIdeExplorerStore.getState().beginCreate({ mode: 'folder' })
  }

  function handleNewItem(item: NewMenuItem) {
    if (item.path) void submitCreate(item.path, item.source)
    else useIdeExplorerStore.getState().beginCreate({ mode: 'file', initial: item.prompt })
  }

  function handleCancelCreate() {
    useIdeExplorerStore.getState().endCreate()
  }

  const rowActions: RowActions | undefined = canEdit
    ? { onRename, onDelete: handleDeleteRequest, onConvert }
    : undefined

  const createRow = create && canEdit && createAnchor && (
    <CreateRow
      key={`${create.mode}:${create.initial ?? ''}`}
      mode={create.mode}
      target={createTarget}
      initial={create.initial}
      existing={existing}
      blockedReason={limits.limitReason}
      depth={createAnchor.depth + 1}
      onSubmit={submitCreate}
      onCancel={handleCancelCreate}
    />
  )

  return (
    <div className="flex h-full flex-col bg-card">
      <ExplorerHeader
        tabs={tabs}
        canEdit={canEdit}
        limitReason={limits.limitReason}
        existing={existing}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onNewItem={handleNewItem}
      />
      <div
        ref={treeRef}
        role="tree"
        aria-label="Project files"
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-auto py-1"
      >
        {rows.map((row) => (
          <Fragment key={row.key}>
            <ExplorerRow
              row={row}
              tabbable={row.key === tabKey}
              active={row.section === 'project' && row.path === activePath && row.kind === 'file'}
              selected={
                row.kind !== 'section' &&
                selected?.path === row.path &&
                selected.section === row.section
              }
              dirty={row.kind === 'file' && dirty.has(row.path)}
              virtual={row.kind === 'file' && virtual.has(row.path)}
              actions={rowActions}
              menuOpen={menuKey === row.key}
              onMenuOpenChange={handleMenuOpenChange}
              onActivate={handleActivate}
              onFocusRow={handleFocusRow}
            />
            {createAnchor?.key === row.key && createRow}
            {row.key === sectionKey('project') && project.length === 0 && !create && (
              <ProjectEmptyState canEdit={canEdit} onCreate={handleNewFile} />
            )}
          </Fragment>
        ))}
      </div>
      <LimitsFooter usage={usage} />
    </div>
  )
}
