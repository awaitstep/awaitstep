import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { LIBRARY_NODE_MANIFEST } from '@awaitstep/ir'
import { actionToast } from '../lib/action-toast'
import { dirtyPaths, overlayDrafts } from '../lib/ide/drafts'
import { createProjectFileActions, type ProjectFileActions } from '../lib/ide/project-actions'
import { filePathOfTab } from '../lib/ide/tabs'
import type { ApiLibraryTree, LibraryPlace } from '../lib/library-api'
import {
  buildIdeIndex,
  ctxPathOf,
  itemRoot,
  nodeFolderOf,
  type LibraryIdeIndex,
} from '../lib/library/ide-index'
import { libraryFileClient, type WrittenFile } from '../lib/library/library-file-client'
import { libraryModelRoot } from '../lib/monaco/library-config'
import { buildNodeCtxDts } from '../lib/monaco/node-ctx-dts'
import { useIdeStore } from '../stores/ide-store'
import { dashKeys } from '../data/dashboard/keys'
import { libraryItemKeys, useLibraryTree } from '../data/dashboard/library'
import { useLibrarySources, type LibrarySourceFile } from './use-library-sources'

const NO_OUTCOMES = new Map()
const NO_PROJECT_MODULES: ApiLibraryTree['projectModules'] = []

export interface LibraryWorkspace {
  place: LibraryPlace
  tree: ReturnType<typeof useLibraryTree>
  index: LibraryIdeIndex
  /** The Monaco model root of this place's library. */
  root: string
  canEdit: boolean
  canCreate: boolean
  readOnlyReason: string | null
  /** What the editor and the type program show: loaded files with drafts, the project's modules and each node folder's ctx.d.ts. */
  files: ReadonlyMap<string, LibrarySourceFile>
  /** Own files whose text is loaded, without drafts. */
  baseline: ReadonlyMap<string, LibrarySourceFile>
  dirty: ReadonlySet<string>
  loading: ReadonlySet<string>
  /** The item Save, Publish and Details act on: the active file's, else the selected one. */
  activeItemId: string | null
  selectItem: (id: string | null) => void
  isReadOnly: (path: string) => boolean
  actions: ProjectFileActions & { busy: boolean }
  refresh: () => Promise<void>
  /** The editor's text for a file: a draft, or none when it equals the saved text. */
  onEditorChange: (path: string, text: string) => void
  /** Drops the drafts and tabs under an item's folder. */
  forgetItem: (root: string) => void
  /** Moves the drafts and tabs under one item folder to another (a slug change). */
  moveItem: (from: string, to: string) => void
}

/**
 * The Library IDE's state (D1, D3): one place's items as one tree, the text
 * the open items need, drafts in the shared session store, and the shared
 * file actions (conditional writes, conflicts, rename, delete) pointed at
 * the Library's file routes.
 */
export function useLibraryWorkspace(
  place: LibraryPlace,
  initialItem: string | undefined,
): LibraryWorkspace {
  const queryClient = useQueryClient()
  const tree = useLibraryTree(place)
  const index = useMemo(() => buildIdeIndex(tree.data), [tree.data])
  const root = libraryModelRoot(tree.data?.owner ?? { kind: 'project', id: place.project })
  const canEdit = tree.data?.viewerCan.edit.allowed ?? false
  const canCreate = tree.data?.viewerCan.create.allowed ?? false
  const readOnlyReason = tree.data?.viewerCan.edit.reason ?? null
  const projectModules = tree.data?.projectModules ?? NO_PROJECT_MODULES

  const { openPaths, activePath, drafts } = useIdeStore(
    useShallow((s) => ({ openPaths: s.openPaths, activePath: s.activePath, drafts: s.drafts })),
  )
  const [selected, setSelected] = useState<string | null>(initialItem ?? null)
  const activeFile = filePathOfTab(activePath)
  const activeItemId = (activeFile && index.itemAt(activeFile)?.id) ?? selected

  const wanted = useMemo(() => {
    const ids = new Set<string>()
    for (const path of openPaths) {
      const file = filePathOfTab(path)
      const item = file ? index.itemAt(file) : null
      if (item) ids.add(item.id)
    }
    if (selected) ids.add(selected)
    return ids
  }, [openPaths, selected, index])

  const sources = useLibrarySources(index, projectModules, wanted, drafts)
  const { baseline } = sources
  const foreignModules = sources.projectModules

  const files = useMemo(() => {
    const shown = new Map<string, LibrarySourceFile>(overlayDrafts(baseline, drafts))
    for (const [path, file] of foreignModules) if (!shown.has(path)) shown.set(path, file)
    // Each node folder's ctx.d.ts, from its node.json as edited.
    for (const [path, file] of shown) {
      const folder = nodeFolderOf(path)
      if (!folder || !path.endsWith(`/${LIBRARY_NODE_MANIFEST}`)) continue
      const ctx = ctxPathOf(folder)
      shown.set(ctx, {
        path: ctx,
        source: buildNodeCtxDts(file.source),
        role: 'module',
        readOnly: true,
      })
    }
    return shown
  }, [baseline, drafts, foreignModules])

  const dirty = useMemo(() => new Set(dirtyPaths(baseline, drafts)), [baseline, drafts])

  const isReadOnly = useCallback(
    (path: string) => {
      if (!canEdit) return true
      const listed = index.files.get(path)
      if (listed) return listed.readOnly
      // Not one of the place's files: a project module, or a generated ctx.d.ts.
      return files.get(path)?.readOnly ?? true
    },
    [canEdit, index, files],
  )

  // Writes outlive renders; what they read when they land is the latest.
  const latest = useRef({ index, baseline, canEdit })
  latest.current = { index, baseline, canEdit }
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  // The tree (new hashes), and each item's check, versions and usages. File
  // texts are keyed by hash, so a changed file is a new key and an unchanged
  // one is never fetched again.
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: dashKeys.inProject('library', place.org, place.project),
      }),
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'library-item' && query.queryKey[2] !== 'file',
      }),
    ])
  }, [queryClient, place.org, place.project])

  // What a save wrote is the file's text at its new hash: cached at once, so
  // the refetched tree finds it loaded and the editor never unmounts.
  const cacheWritten = useCallback(
    (file: WrittenFile) => {
      queryClient.setQueryData([...libraryItemKeys.file(file.itemId, file.itemPath), file.hash], {
        path: file.itemPath,
        source: file.source,
        hash: file.hash,
        size: 0,
        updatedAt: '',
        readOnly: false,
      })
    },
    [queryClient],
  )

  const [inFlight, setInFlight] = useState(0)
  const core = useMemo(
    () =>
      createProjectFileActions({
        workflowId: root,
        target: 'workflow',
        client: libraryFileClient(() => latest.current.index, cacheWritten),
        notify: actionToast,
        getBaseline: () => latest.current.baseline,
        getStore: useIdeStore.getState,
        isCurrent: () => live.current,
        getProjectPaths: () => new Set(latest.current.baseline.keys()),
        ownerOf: () => 'project',
        saveSteps: () => Promise.resolve(NO_OUTCOMES),
        commit: () => Promise.resolve(),
        refresh,
        canEdit: () => latest.current.canEdit,
        importSpecifierOf: (path) => {
          const item = latest.current.index.itemAt(path)
          if (!item || item.kind !== 'module') return null
          return path === `${itemRoot(item)}/index.ts` ? `#modules/${item.slug}` : null
        },
      }),
    [root, refresh, cacheWritten],
  )

  const actions = useMemo(() => {
    async function track<T>(work: () => Promise<T>): Promise<T> {
      setInFlight((n) => n + 1)
      try {
        return await work()
      } finally {
        setInFlight((n) => n - 1)
      }
    }
    return {
      saveFile: (path: string) => track(() => core.saveFile(path)),
      saveFiles: (paths: readonly string[]) => track(() => core.saveFiles(paths)),
      saveAll: () => track(() => core.saveAll()),
      overwriteFile: (path: string, hash: string | null) =>
        track(() => core.overwriteFile(path, hash)),
      recreateFile: (path: string) => track(() => core.recreateFile(path)),
      createFile: (path: string, source?: string) => track(() => core.createFile(path, source)),
      renameFile: (from: string, to: string) => track(() => core.renameFile(from, to)),
      deleteFile: (path: string) => track(() => core.deleteFile(path)),
      deleteFolder: (dir: string) => track(() => core.deleteFolder(dir)),
      convertHandlers: () => core.convertHandlers(),
      busy: inFlight > 0,
    }
  }, [core, inFlight])

  const selectItem = useCallback((id: string | null) => setSelected(id), [])

  // Typing back to the saved text is no edit at all: the draft goes, as in
  // the workflow IDE. So does an echo of a model the sync just updated.
  const onEditorChange = useCallback(
    (path: string, text: string) => {
      const store = useIdeStore.getState()
      const base = baseline.get(path)
      if (base?.source === text) store.clearDraft(path)
      else store.setDraft(path, text, base?.hash ?? null)
    },
    [baseline],
  )

  // Once files load or reload, drafts that now match them are dropped (a
  // save's refetch, a publish's bumped package.json) and tabs for files
  // that are gone close, unless they still hold edits. A store outside
  // React, so this is the after-render sync the workflow IDE does too.
  const loaded = tree.data !== undefined
  useEffect(() => {
    if (!loaded) return
    const store = useIdeStore.getState()
    store.reconcileDrafts(baseline)
    store.pruneFiles([...index.files.keys(), ...files.keys()])
  }, [loaded, baseline, index, files])

  /** Drops an item's drafts and tabs: it was deleted, or its code was replaced (restore). */
  const forgetItem = useCallback((root: string) => {
    const store = useIdeStore.getState()
    const inside = (path: string) => path.startsWith(`${root}/`)
    for (const path of Object.keys(store.drafts)) if (inside(path)) store.clearDraft(path)
    store.closeFiles(store.openPaths.filter((tab) => inside(filePathOfTab(tab) ?? '')))
  }, [])

  /** An item's slug changed: its drafts and tabs follow it to the new folder. */
  const moveItem = useCallback((from: string, to: string) => {
    const store = useIdeStore.getState()
    const paths = new Set([...Object.keys(store.drafts), ...store.openPaths])
    for (const path of paths) {
      if (path.startsWith(`${from}/`)) store.moveFile(path, `${to}${path.slice(from.length)}`)
    }
  }, [])

  return {
    place,
    tree,
    index,
    root,
    canEdit,
    canCreate,
    readOnlyReason,
    files,
    baseline,
    dirty,
    loading: sources.loading,
    activeItemId,
    selectItem,
    isReadOnly,
    actions,
    refresh,
    onEditorChange,
    forgetItem,
    moveItem,
  }
}
