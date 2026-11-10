import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { STEP_SOURCE_DIR } from '@awaitstep/ir'
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
import { useIdeStepsStore } from '../../stores/ide-steps-store'
import { appendsAfter } from '../../lib/ide/step-placements'
import { RenameRow } from './file-explorer-rename'
import { CreateRow } from './file-explorer-create'
import {
  CLOUDFLARE_BINDINGS_PATH,
  CLOUDFLARE_BINDINGS_SOURCE,
} from '../../lib/ide/bindings-template'
import { LimitsFooter } from './file-explorer-footer'
import { UnsavedSection } from './file-explorer-unsaved'
import { ExplorerHeader } from './file-explorer-header'
import { useStepSyncOptional, type StepSyncEdge } from './step-sync-context'
import {
  ExplorerRow,
  GeneratedEmptyState,
  ProjectEmptyState,
  ancestorKeys,
  type ProjectNewMenu,
  type RowActions,
} from './file-explorer-rows'

interface FileExplorerProps {
  /** The side bar's view switch, shown in the header. */
  tabs?: ReactNode
  project: TreeNode[]
  generated: TreeNode[]
  dirty: ReadonlySet<string>
  /** The unsaved files in review order, listed above the tree while there are any. */
  unsavedPaths: string[]
  /** Opens the Unsaved changes tab, on one file when given. */
  onReview: (path?: string) => void
  /** Project files surfaced from legacy settings that are not stored yet. */
  virtual: ReadonlySet<string>
  /** Step sources: a canvas node's code under `steps/`, edited here but never a file to create, rename or delete. */
  stepPaths: ReadonlySet<string>
  canEdit: boolean
  /** Stored project files only (virtual seeds are not counted by the server). */
  usage: ProjectUsage
  /**
   * Creates the file. Resolves to whether it was created; the caller opens it
   * at line 1 and moves focus into the editor.
   */
  onCreateFile: (path: string, source?: string) => Promise<boolean>
  /** Renames to the typed path; resolves to whether it was renamed. */
  onRenameFile: (from: string, to: string) => Promise<boolean>
  onDelete: (path: string) => void
  onDeleteFolder: (dir: string) => void
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
  unsavedPaths,
  onReview,
  virtual,
  stepPaths,
  canEdit,
  usage,
  onCreateFile,
  onRenameFile,
  onDelete,
  onDeleteFolder,
  onConvert,
  onEscape,
}: FileExplorerProps) {
  const { activePath, openFile } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, openFile: s.openFile })),
  )
  const { selected, create, renaming, focusPath } = useIdeExplorerStore(
    useShallow((s) => ({
      selected: s.selected,
      create: s.create,
      renaming: s.renaming,
      focusPath: s.focusPath,
    })),
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
  // The steps folder's menu opens the placement picker; the prompt itself
  // lives in the Steps view, which the chosen connection opens.
  const sync = useStepSyncOptional()
  // One index for the whole tree: the menu is built for every step-file row,
  // so filtering the edge list there would be quadratic on a large graph.
  const syncEdges = sync?.edges
  const edgesBySource = useMemo(() => {
    const bySource = new Map<string, StepSyncEdge[]>()
    for (const edge of syncEdges ?? []) {
      const list = bySource.get(edge.source)
      if (list) list.push(edge)
      else bySource.set(edge.source, [edge])
    }
    return bySource
  }, [syncEdges])
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of syncEdges ?? []) counts.set(edge.id, (counts.get(edge.id) ?? 0) + 1)
    return counts
  }, [syncEdges])
  // A step file's row opens the same name row, for that step.
  const stepNodeByPath = useMemo(() => {
    const byPath = new Map<string, string>()
    if (!sync || !canEdit) return byPath
    for (const [nodeId, info] of sync.map.byNode) {
      if (info.sourcePath !== null) byPath.set(info.sourcePath, nodeId)
    }
    return byPath
  }, [sync, canEdit])
  const limits = usageStatus(usage)
  const target = resolveTargetFolder({ selected, activePath, projectPaths })

  const rows = useMemo(() => {
    const forceOpen = create ? new Set([sectionKey('project'), ...ancestorKeys(target)]) : undefined
    // The steps folder and its files take no file menu: step code belongs to
    // its node, and the folder's own menu adds a step (never a file).
    const isStep = (node: TreeNode) =>
      node.kind === 'dir' ? node.path === STEP_SOURCE_DIR : stepPaths.has(node.path)
    return flattenTreeRows(
      [
        { id: 'project', label: 'Project', nodes: project },
        { id: 'generated', label: 'Generated', nodes: generated },
      ],
      collapsed,
      {
        forceOpen,
        isEditable: (node) => canEdit && !virtual.has(node.path) && !isStep(node),
      },
    )
  }, [project, generated, collapsed, create, target, canEdit, virtual, stepPaths])

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

  function handleRenameRequest(path: string) {
    useIdeExplorerStore.getState().beginRename(path)
  }

  async function submitRename(from: string, to: string): Promise<boolean> {
    const renamed = await onRenameFile(from, to)
    if (renamed) useIdeExplorerStore.getState().endRename()
    return renamed
  }

  // The row comes back and takes focus, as after any cancelled edit.
  function handleCancelRename() {
    const path = useIdeExplorerStore.getState().renaming
    useIdeExplorerStore.getState().endRename()
    if (path) useIdeExplorerStore.getState().requestFocus(path)
  }

  function handleDeleteRequest(path: string, kind: 'file' | 'dir' = 'file') {
    const key = rowKey('project', path)
    setRemoval({ key, next: focusAfterRemoval(rows, key) })
    if (kind === 'dir') onDeleteFolder(path)
    else onDelete(path)
  }

  function handleDeleteFolderRequest(dir: string) {
    handleDeleteRequest(dir, 'dir')
  }

  // A new file inside this folder: the folder becomes the target and opens.
  function handleNewFileIn(dir: string) {
    const explorer = useIdeExplorerStore.getState()
    explorer.select({ path: dir, kind: 'dir', section: 'project' })
    toggle(rowKey('project', dir), true)
    explorer.beginCreate({ mode: 'file' })
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
        return handleRenameRequest(row.path)
      case 'delete':
        return handleDeleteRequest(row.path, row.kind === 'dir' ? 'dir' : 'file')
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

  // A modal menu holds focus while it is open, so a name field that mounted
  // meanwhile lost its autofocus: it is given focus once the menu is gone.
  function focusNameField() {
    requestAnimationFrame(() =>
      treeRef.current?.querySelector<HTMLInputElement>('input[data-ide-text-input]')?.focus(),
    )
  }

  function handleMenuOpenChange(key: string, open: boolean) {
    setMenuKey(open ? key : null)
    // Closing the menu hands focus back to its row, unless the choice opened a
    // name field: taking focus from it would dismiss the field at once.
    if (open) return
    const explorer = useIdeExplorerStore.getState()
    if (explorer.create || explorer.renaming) focusNameField()
    // A step's name row lives in the Steps view; focusing this folder's row
    // would take the keyboard from it.
    else if (useIdeStepsStore.getState().picker === null) focusRow(key)
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

  async function handleCreateBindings() {
    if (projectPaths.has(CLOUDFLARE_BINDINGS_PATH)) {
      openFile(CLOUDFLARE_BINDINGS_PATH)
      return
    }
    await submitCreate(CLOUDFLARE_BINDINGS_PATH, CLOUDFLARE_BINDINGS_SOURCE)
  }

  // A step is not a file: the folder's menu opens the add dialog, and so does
  // a step whose connection cannot be spliced blindly (it branches, or its one
  // connection is an arm). The file menu never dead-ends on a placement
  // `insertStep` can only refuse.
  function stepNodeForRow(
    row: TreeRow,
    byPath: ReadonlyMap<string, string>,
    sync: ReturnType<typeof useStepSyncOptional>,
  ): { id: string; name: string; direct: boolean; reason: string | null } | null {
    if (row.kind !== 'file') return null
    const id = byPath.get(row.path)
    if (id === undefined) return null
    const node = sync?.nodes.get(id)
    if (!sync || !node) return { id, name: row.name, direct: true, reason: null }
    const outgoing = edgesBySource.get(id) ?? []
    const direct = appendsAfter(node, outgoing, edgeCounts)
    const hasChoice = outgoing.some((edge) => edgeCounts.get(edge.id) === 1)
    return {
      id,
      name: node.name,
      direct,
      reason:
        !direct && !hasChoice
          ? 'This step’s only connection shares its id with another edge. Rename one on the canvas.'
          : null,
    }
  }

  function handleNewStepAfter(nodeId: string) {
    if (!canEdit) return
    useIdeLayoutStore.getState().showSideBar('steps')
    const node = sync?.nodes.get(nodeId)
    if (!sync || !node) {
      useIdeStepsStore.getState().openPicker()
      return
    }
    const outgoing = edgesBySource.get(nodeId) ?? []
    if (appendsAfter(node, outgoing, edgeCounts)) {
      useIdeStepsStore.getState().openPicker(nodeId, { after: nodeId })
      return
    }
    if (outgoing.some((edge) => edgeCounts.get(edge.id) === 1)) {
      useIdeStepsStore.getState().openPicker(nodeId)
    }
  }

  function handleOpenStepPicker() {
    if (!canEdit) return
    useIdeLayoutStore.getState().showSideBar('steps')
    useIdeStepsStore.getState().openPicker()
  }

  function handleNewFolder() {
    useIdeExplorerStore.getState().beginCreate({ mode: 'folder' })
  }

  // The Project row's menu adds at the project root, whatever is selected.
  function selectRoot() {
    useIdeExplorerStore.getState().select({ path: '', kind: 'dir', section: 'project' })
  }

  function handleRootNewFile() {
    selectRoot()
    handleNewFile()
  }

  function handleRootNewFolder() {
    selectRoot()
    handleNewFolder()
  }

  function handleRootNewItem(item: NewMenuItem) {
    selectRoot()
    handleNewItem(item)
  }

  function handleNewItem(item: NewMenuItem) {
    if (item.path) void submitCreate(item.path, item.source)
    else useIdeExplorerStore.getState().beginCreate({ mode: 'file', initial: item.prompt })
  }

  function handleCancelCreate() {
    useIdeExplorerStore.getState().endCreate()
  }

  const rowActions: RowActions | undefined = canEdit
    ? {
        onRename: handleRenameRequest,
        onDelete: handleDeleteRequest,
        onConvert,
        onNewFileIn: handleNewFileIn,
        onDeleteFolder: handleDeleteFolderRequest,
      }
    : undefined

  const newMenu: ProjectNewMenu | undefined = canEdit
    ? {
        limitReason: limits.limitReason,
        existing,
        onNewFile: handleRootNewFile,
        onNewFolder: handleRootNewFolder,
        onNewItem: handleRootNewItem,
        onCreateBindings: handleCreateBindings,
      }
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
        onCreateBindings={handleCreateBindings}
      />
      {canEdit && <UnsavedSection paths={unsavedPaths} onReview={onReview} />}
      <div
        ref={treeRef}
        role="tree"
        aria-label="Project files"
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-auto py-1"
      >
        {rows.map((row) => (
          <Fragment key={row.key}>
            {canEdit && row.kind === 'file' && row.path === renaming ? (
              <RenameRow
                path={row.path}
                role={row.node!.role}
                existing={existing}
                depth={row.depth}
                onSubmit={(to) => submitRename(row.path, to)}
                onCancel={handleCancelRename}
              />
            ) : (
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
                step={
                  row.section === 'project' &&
                  (row.kind === 'file' ? stepPaths.has(row.path) : row.path === STEP_SOURCE_DIR)
                }
                actions={rowActions}
                newMenu={newMenu}
                onNewStepAfter={handleNewStepAfter}
                onOpenStepPicker={canEdit ? handleOpenStepPicker : undefined}
                stepNode={stepNodeForRow(row, stepNodeByPath, sync)}
                menuOpen={menuKey === row.key}
                onMenuOpenChange={handleMenuOpenChange}
                onActivate={handleActivate}
                onFocusRow={handleFocusRow}
              />
            )}
            {createAnchor?.key === row.key && createRow}
            {row.key === sectionKey('project') && project.length === 0 && !create && (
              <ProjectEmptyState canEdit={canEdit} onCreate={handleNewFile} />
            )}
            {row.key === sectionKey('generated') &&
              generated.length === 0 &&
              !collapsed.has(row.key) && <GeneratedEmptyState />}
          </Fragment>
        ))}
      </div>
      <LimitsFooter usage={usage} />
    </div>
  )
}
