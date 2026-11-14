import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dirtyPaths } from '../lib/ide/drafts'
import { countBySeverity, diagnosticProblems, groupProblems } from '../lib/ide/problems'
import { VIEW_ONLY_MESSAGE, fileEditability, workspaceEditability } from '../lib/ide/editability'
import { useEditorAccess } from '../contexts/editor-scope-context'
import { buildFileTree } from '../lib/ide/file-tree'
import {
  loadVersionDocument,
  stepCollisionProblems,
  stepSources,
  type StepSources,
} from '../lib/ide/node-source'
import {
  fileOwner,
  projectUsage,
  splitWorkspaceFiles,
  libraryFilesOf,
  storedFiles as storedOf,
  virtualSeedFiles,
} from '../lib/ide/project'
import { applyFileOps, newFilePaths, vacatedPaths, type PendingFileOp } from '../lib/ide/file-ops'
import { editedVersion, pendingNodeIds, pendingStepPaths, waitingOps } from '../lib/ide/graph-ops'
import { formatClock } from '../lib/ide/session-log'
import { deriveReadOnlyState } from '../lib/hydrate-workflow'
import type { SourceFile } from '../lib/api-client'
import { useApiReady, useQueries } from '../contexts/api-client-context'
import { useIdeStore } from '../stores/ide-store'
import { useDraftOverlay } from './use-draft-overlay'
import { useWorkspaceProblems } from './use-workspace-problems'

const EMPTY_FILES: ReadonlyMap<string, SourceFile> = new Map()
const NO_FILE_OPS: readonly PendingFileOp[] = []
const NO_STEPS: StepSources = { files: [], byNode: new Map(), byPath: new Map(), collisions: [] }

/**
 * What the code workspace shows, derived from the two queries and the open
 * drafts: which files exist, which are project-owned, dirty, virtual or
 * deleted outside, how they are laid out, and the problem lists.
 */
export function useWorkspaceData(workflowId: string, versionParam: string | undefined) {
  const queries = useQueries()
  const ready = useApiReady()
  const fullQuery = useQuery({
    ...queries.workflows.full(workflowId, versionParam),
    enabled: ready,
  })
  const sourceQuery = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  const fullData = fullQuery.data
  const source = sourceQuery.data
  // The files come from the source, the step sources from the version: the
  // baseline waits for both, so nothing downstream (draft restore, tab
  // pruning) ever judges a step file against a baseline that lacks it.
  const loaded = source !== undefined && fullData !== undefined
  const drafts = useIdeStore((s) => s.drafts)
  const graphOps = useIdeStore((s) => s.graphOps)
  const fileOps = useIdeStore((s) => s.fileOps)
  const { isReadOnly: isHistorical, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow.currentVersionId,
    fullData?.versions,
  )
  // The stored project files only: what the file routes know, hashed.
  const storedFiles = useMemo(
    () => (source ? storedOf(source.files) : new Map<string, SourceFile>()),
    [source],
  )
  const storedHashes = useMemo(
    () => Object.fromEntries([...storedFiles.values()].map((f) => [f.path, f.hash!])),
    [storedFiles],
  )

  const access = useEditorAccess()
  const workspace = useMemo(
    () =>
      source
        ? workspaceEditability({
            historical: isHistorical,
            roleRefusal: access.canEdit ? null : (access.reason ?? VIEW_ONLY_MESSAGE),
          })
        : null,
    [source, isHistorical, access.canEdit, access.reason],
  )
  const canEdit = workspace !== null && !workspace.readOnly

  // Ownership comes from the two responses: a file with a hash is
  // project-owned (the hash is its write precondition), a step node's code
  // is a step source (saved through the version), the rest is generated.
  // Legacy settings surface as virtual files to adopt.
  const storedPaths = useMemo(() => new Set(storedFiles.keys()), [storedFiles])
  const savedVersion = useMemo(() => loadVersionDocument(fullData), [fullData])
  // The loaded version with Code's pending graph edits replayed: what the
  // step files, Steps list, inspector and map show. An older version never
  // holds any (edits are refused there).
  const version = useMemo(
    () =>
      savedVersion && !isHistorical ? editedVersion(savedVersion, graphOps).version : savedVersion,
    [savedVersion, isHistorical, graphOps],
  )
  const pendingNodes = useMemo(() => pendingNodeIds(graphOps), [graphOps])
  // The edits a save would write: the list Unsaved changes shows.
  const waitingGraphOps = useMemo(() => waitingOps(graphOps), [graphOps])
  const steps = useMemo(
    () => (version ? stepSources(version.doc, storedPaths) : NO_STEPS),
    [version, storedPaths],
  )
  const stepPaths = useMemo(() => new Set(steps.files.map((f) => f.path)), [steps])
  // Node → its editable source, for the nodes that have one here: a step
  // whose path another step or a stored file holds is left out, so nothing
  // downstream can open the wrong file for it.
  const stepSourceByNode = useMemo(
    () => new Map([...steps.byNode].map(([nodeId, file]) => [nodeId, file.path])),
    [steps],
  )
  const seeds = useMemo(
    () => (canEdit && fullData ? virtualSeedFiles(fullData.workflow, storedPaths) : []),
    [canEdit, fullData, storedPaths],
  )
  // The project files as Code shows them: a pending delete or rename has
  // freed its old path, and new or renamed files are the project's own. An
  // older version never holds pending changes.
  const shownFileOps = isHistorical ? NO_FILE_OPS : fileOps
  const shownStoredPaths = useMemo(() => {
    if (shownFileOps.length === 0) return storedPaths
    const vacated = vacatedPaths(shownFileOps)
    return new Set([
      ...[...storedPaths].filter((path) => !vacated.has(path)),
      ...newFilePaths(shownFileOps),
    ])
  }, [storedPaths, shownFileOps])
  const savedProjectPaths = useMemo(
    () => new Set([...shownStoredPaths, ...seeds.map((f) => f.path), ...stepPaths]),
    [shownStoredPaths, seeds, stepPaths],
  )
  const virtualPaths = useMemo(() => new Set(seeds.map((f) => f.path)), [seeds])

  const baseline = useMemo(() => {
    if (!source || !loaded) return EMPTY_FILES
    const map = new Map<string, SourceFile>(source.files.map((file) => [file.path, file]))
    for (const seed of seeds) if (!map.has(seed.path)) map.set(seed.path, seed)
    // A step's module is emitted at the step's own path, so the bundle has a
    // generated copy there: the editable source replaces it. (A stored file
    // at that path is a collision, and `stepSources` leaves the step out.)
    for (const step of steps.files) map.set(step.path, step)
    return applyFileOps(map, shownFileOps)
  }, [source, loaded, seeds, steps, shownFileOps])
  const { files, projectPaths, ghostPaths } = useDraftOverlay(baseline, drafts, savedProjectPaths)
  // Stored files only (neither a virtual seed nor a step source is counted by
  // the server); it changes when files do, not with every keystroke.
  const usage = useMemo(() => projectUsage(storedFiles.values()), [storedFiles])
  const dirty = useMemo(() => new Set(dirtyPaths(baseline, drafts)), [baseline, drafts])
  // A pending node's step file is new: nothing saved stands behind it, so its
  // tab and row show the unsaved dot. Its Add is what a save writes, so it is
  // counted once, as a graph edit, not again as a file.
  const newStepPaths = useMemo(
    () => new Set(pendingStepPaths(graphOps).filter((path) => baseline.has(path))),
    [graphOps, baseline],
  )
  // New and renamed files have nothing saved at their path yet.
  const newFiles = useMemo(() => newFilePaths(shownFileOps), [shownFileOps])
  const shownDirty = useMemo(
    () =>
      newStepPaths.size === 0 && newFiles.length === 0
        ? dirty
        : new Set([...dirty, ...newStepPaths, ...newFiles]),
    [dirty, newStepPaths, newFiles],
  )
  // What Save would write: files with unsaved text, each new or renamed file
  // once (its text included), each pending delete, each pending graph edit.
  const pendingDeletes = shownFileOps.filter((op) => op.kind === 'delete').length
  const unsavedCount =
    new Set([...dirty, ...newFiles]).size + pendingDeletes + waitingGraphOps.length
  // Trees only depend on which files exist, so a keystroke never rebuilds them.
  // The Library modules the bundle carries, by file: read-only here.
  const libraryFiles = useMemo(
    () => libraryFilesOf(baseline.keys(), source?.library ?? []),
    [baseline, source],
  )
  const libraryPaths = useMemo(() => new Set(libraryFiles.keys()), [libraryFiles])
  const trees = useMemo(() => {
    const split = splitWorkspaceFiles(baseline.values(), projectPaths, libraryPaths)
    return {
      project: buildFileTree(split.project),
      library: buildFileTree(split.library),
      generated: buildFileTree(split.generated),
    }
  }, [baseline, projectPaths, libraryPaths])

  // One problem list for the dock and the status bar: server findings first,
  // since they explain the editor markers after them. A step whose path is
  // taken (by another step or a stored file) is reported there too.
  const markers = useWorkspaceProblems(workflowId)
  const savedProblems = useMemo(
    () => [
      ...diagnosticProblems(source?.diagnostics ?? []),
      ...stepCollisionProblems(steps.collisions),
    ],
    [source, steps],
  )
  const problemGroups = useMemo(
    () => groupProblems(markers, savedProblems, dirty, (nodeId) => stepSourceByNode.get(nodeId)),
    [markers, savedProblems, dirty, stepSourceByNode],
  )
  // The status bar counts both groups, as the dock does.
  const problemCounts = countBySeverity([...savedProblems, ...markers])
  const savedAt = sourceQuery.dataUpdatedAt
    ? formatClock(new Date(sourceQuery.dataUpdatedAt).toISOString())
    : null

  const ownerOf = useMemo(
    () => (path: string) => fileOwner(path, { projectPaths, storedPaths, libraryPaths }),
    [projectPaths, storedPaths, libraryPaths],
  )

  function editabilityOf(path: string) {
    return fileEditability(ownerOf(path), workspace ?? { readOnly: true, message: null })
  }

  return {
    fullQuery,
    sourceQuery,
    fullData,
    source,
    loaded,
    hasVersion: !!fullData?.version,
    savedVersion,
    editedDoc: version?.doc ?? null,
    waitingGraphOps,
    fileOps: shownFileOps,
    pendingNodes,
    unsavedCount,
    newStepPaths,
    shownDirty,
    isHistorical,
    readOnlyVersion,
    storedFiles,
    storedHashes,
    workspace,
    canEdit,
    storedPaths: shownStoredPaths,
    virtualPaths,
    stepPaths,
    stepSourceByNode,
    baseline,
    files,
    projectPaths,
    ghostPaths,
    usage,
    dirty,
    trees,
    libraryFiles,
    libraryPaths,
    problemGroups,
    problemCounts,
    savedAt,
    ownerOf,
    editabilityOf,
  }
}

export type WorkspaceData = ReturnType<typeof useWorkspaceData>
