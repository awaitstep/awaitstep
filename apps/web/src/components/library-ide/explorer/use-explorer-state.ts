import { useState } from 'react'
import type { LibraryKind } from '../../../lib/library-api'
import { ROOT_DIR, type LibraryIdeIndex } from '../../../lib/library/ide-index'
import { newFileError } from '../../../lib/library/explorer-tree'
import { focusNameField } from './focus-name-field'

/** The one name being typed in the tree: a new item, a new file in a folder, or a file's new name. */
export type Editing =
  | { kind: 'new-item'; itemKind: LibraryKind }
  | { kind: 'create'; folder: string }
  | { kind: 'rename'; path: string }
  | null

export interface ExplorerWrites {
  /** Resolves to why the item was refused, or null once it exists. */
  onCreateItem: (kind: LibraryKind, name: string) => Promise<string | null>
  onCreateFile: (path: string) => Promise<boolean>
  onRenameFile: (from: string, to: string) => Promise<boolean>
}

/**
 * The explorer's own state: which folders are collapsed, and the name being
 * typed. A row closes once its write lands and stays open on a refusal.
 */
export function useExplorerState(
  index: LibraryIdeIndex,
  writes: ExplorerWrites,
  initialNew?: LibraryKind,
) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [editing, setEditing] = useState<Editing>(() =>
    initialNew ? { kind: 'new-item', itemKind: initialNew } : null,
  )

  function isOpen(path: string): boolean {
    return !collapsed.has(path)
  }

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function openFolder(folder: string) {
    setCollapsed((current) => {
      if (!current.has(folder)) return current
      const next = new Set(current)
      next.delete(folder)
      return next
    })
  }

  // A name is typed where it will appear: its folder opens first.
  function beginCreate(folder: string) {
    openFolder(folder)
    setEditing({ kind: 'create', folder })
    focusNameField()
  }

  function beginNewItem(kind: LibraryKind) {
    openFolder(ROOT_DIR[kind])
    setEditing({ kind: 'new-item', itemKind: kind })
    focusNameField()
  }

  function beginRename(path: string) {
    setEditing({ kind: 'rename', path })
    focusNameField()
  }

  function stopEditing() {
    setEditing(null)
  }

  async function submitNewItem(name: string): Promise<string | null> {
    if (editing?.kind !== 'new-item') return null
    const refusal = await writes.onCreateItem(editing.itemKind, name)
    if (refusal === null) setEditing(null)
    return refusal
  }

  async function submitCreate(path: string): Promise<boolean> {
    const created = await writes.onCreateFile(path)
    if (created) setEditing(null)
    return created
  }

  async function submitRename(from: string, to: string): Promise<boolean> {
    const renamed = await writes.onRenameFile(from, to)
    if (renamed) setEditing(null)
    return renamed
  }

  // The item's own rules (its kind's paths, a name already there), under the folder typed in.
  function refusalIn(folder: string) {
    return (path: string) => newFileError(index, folder, path.slice(folder.length + 1))
  }

  return {
    editing,
    isOpen,
    toggle,
    beginCreate,
    beginNewItem,
    beginRename,
    stopEditing,
    submitNewItem,
    submitCreate,
    submitRename,
    refusalIn,
  }
}

export type ExplorerState = ReturnType<typeof useExplorerState>
