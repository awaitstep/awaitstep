import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dirtyPaths } from '../lib/ide/drafts'
import { countBySeverity, diagnosticProblems, groupProblems } from '../lib/ide/problems'
import { fileEditability, workspaceEditability } from '../lib/ide/editability'
import { buildFileTree } from '../lib/ide/file-tree'
import { fileOwner, projectUsage, splitWorkspaceFiles, virtualSeedFiles } from '../lib/ide/project'
import { formatClock } from '../lib/ide/session-log'
import { deriveReadOnlyState } from '../lib/hydrate-workflow'
import type { SourceFile } from '../lib/api-client'
import { useApiReady, useQueries } from '../contexts/api-client-context'
import { useIdeStore } from '../stores/ide-store'
import { useDraftOverlay } from './use-draft-overlay'
import { useWorkspaceProblems } from './use-workspace-problems'

const EMPTY_FILES: ReadonlyMap<string, SourceFile> = new Map()

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
  const drafts = useIdeStore((s) => s.drafts)
  const { isReadOnly: isHistorical, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow.currentVersionId,
    fullData?.versions,
  )
  const storedHashes = useMemo(
    () =>
      Object.fromEntries(
        (source?.files ?? []).flatMap((f) => (f.hash !== undefined ? [[f.path, f.hash]] : [])),
      ),
    [source],
  )

  const workspace = useMemo(
    () => (source ? workspaceEditability({ historical: isHistorical }) : null),
    [source, isHistorical],
  )
  const canEdit = workspace !== null && !workspace.readOnly

  // Everything about ownership comes from the one source response: a file
  // with a hash is project-owned (the hash is its write precondition), the
  // rest is generated. Legacy settings surface as virtual files to adopt.
  const storedPaths = useMemo(
    () => new Set((source?.files ?? []).filter((f) => f.hash !== undefined).map((f) => f.path)),
    [source],
  )
  const seeds = useMemo(
    () => (canEdit && fullData ? virtualSeedFiles(fullData.workflow, storedPaths) : []),
    [canEdit, fullData, storedPaths],
  )
  const savedProjectPaths = useMemo(
    () => new Set([...storedPaths, ...seeds.map((f) => f.path)]),
    [storedPaths, seeds],
  )
  const virtualPaths = useMemo(() => new Set(seeds.map((f) => f.path)), [seeds])

  const baseline = useMemo(() => {
    if (!source) return EMPTY_FILES
    const map = new Map<string, SourceFile>(source.files.map((file) => [file.path, file]))
    for (const seed of seeds) if (!map.has(seed.path)) map.set(seed.path, seed)
    return map
  }, [source, seeds])
  const { files, projectPaths, ghostPaths } = useDraftOverlay(baseline, drafts, savedProjectPaths)
  // Stored files only (a virtual seed is not counted by the server); it
  // changes when files do, not with every keystroke.
  const usage = useMemo(
    () =>
      projectUsage(
        [...baseline.values()].filter((f) => f.hash !== undefined && !virtualPaths.has(f.path)),
      ),
    [baseline, virtualPaths],
  )
  const dirty = useMemo(() => new Set(dirtyPaths(baseline, drafts)), [baseline, drafts])
  // Trees only depend on which files exist, so a keystroke never rebuilds them.
  const trees = useMemo(() => {
    const split = splitWorkspaceFiles(baseline.values(), projectPaths)
    return { project: buildFileTree(split.project), generated: buildFileTree(split.generated) }
  }, [baseline, projectPaths])

  // One problem list for the dock and the status bar: server findings first,
  // since they explain the editor markers after them.
  const markers = useWorkspaceProblems(workflowId)
  const savedProblems = useMemo(() => diagnosticProblems(source?.diagnostics ?? []), [source])
  const problemGroups = useMemo(
    () => groupProblems(markers, savedProblems, dirty),
    [markers, savedProblems, dirty],
  )
  // The status bar counts both groups, as the dock does.
  const problemCounts = countBySeverity([...savedProblems, ...markers])
  const savedAt = sourceQuery.dataUpdatedAt
    ? formatClock(new Date(sourceQuery.dataUpdatedAt).toISOString())
    : null

  function editabilityOf(path: string) {
    return fileEditability(
      fileOwner(path, projectPaths),
      workspace ?? { readOnly: true, message: null },
    )
  }

  return {
    fullQuery,
    sourceQuery,
    fullData,
    source,
    isHistorical,
    readOnlyVersion,
    storedHashes,
    workspace,
    canEdit,
    storedPaths,
    virtualPaths,
    baseline,
    files,
    projectPaths,
    ghostPaths,
    usage,
    dirty,
    trees,
    problemGroups,
    problemCounts,
    savedAt,
    editabilityOf,
  }
}

export type WorkspaceData = ReturnType<typeof useWorkspaceData>
