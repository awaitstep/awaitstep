import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useUnsavedLibraryModules } from '../../hooks/use-unsaved-library-modules'
import { canvasLibraryRoots, canvasSavedCode } from '../../lib/ide/unsaved-library'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useApiReady, useQueries } from '../../contexts/api-client-context'
import { useProjectLanguageService } from '../../hooks/use-project-language-service'
import { libraryFilesOf, storedFiles } from '../../lib/ide/project'
import type { SourceFile } from '../../lib/api-client'

const NO_FILES: ReadonlyMap<string, SourceFile> = new Map()

function codeOfNodes(state: { nodes: readonly { data: { irNode: { data: unknown } } }[] }) {
  return state.nodes
    .map((node) => (node.data.irNode.data as { code?: unknown } | undefined)?.code)
    .filter((code): code is string => typeof code === 'string')
}

interface CanvasLanguageServiceProps {
  workflowId: string
  /** The `?version=` the canvas shows, so the files are that version's. */
  versionParam?: string
  /** The canvas can be edited (not an older version, not view-only): only then are unsaved imports resolved. */
  editable: boolean
}

/**
 * Gives the canvas's step editors the project's own files as Monaco models,
 * so an `#app/lib/x` import in a step body completes and resolves exactly
 * as it does in Code. The step editor keeps its anonymous model: the
 * workflow root is absolute, so it resolves into these models from
 * anywhere. Mounted with the canvas, not with a selection — swapping the
 * models for every selected node would restart the language workers each
 * time. Only the stored files (the ones a person wrote) and the Library
 * modules the bundle carries are loaded, not the generated bundle, and "Cannot find module" stays muted as before: type
 * acquisition is Code's. A module only an unsaved step imports is fetched
 * as the next deploy would bundle it, as Code does.
 */
export function CanvasLanguageService({
  workflowId,
  versionParam,
  editable,
}: CanvasLanguageServiceProps) {
  const queries = useQueries()
  const ready = useApiReady()
  const { data } = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  // Each node's code as the canvas holds it now, unsaved edits included.
  const nodeCode = useWorkflowStore(useShallow(codeOfNodes))
  const saved = useMemo(() => canvasSavedCode(data?.files ?? []), [data])
  const roots = useMemo(() => canvasLibraryRoots(saved, nodeCode), [saved, nodeCode])
  // A step that imports a module the saved bundle does not carry yet gets it
  // before the save, as Code does, once the saved side is known.
  const edited = useUnsavedLibraryModules(workflowId, roots, editable && data !== undefined)
  const files = useMemo(() => {
    if (!data) return NO_FILES
    const own = storedFiles<SourceFile>(data.files)
    if (edited) {
      for (const file of edited.files) if (!own.has(file.path)) own.set(file.path, file)
      return own
    }
    // Library modules the bundle carries, so a step's `#modules/x` import
    // completes and type-checks here as it does in Code.
    const library = libraryFilesOf(
      data.files.map((file) => file.path),
      data.library ?? [],
    )
    for (const file of data.files) if (library.has(file.path)) own.set(file.path, file)
    return own
  }, [data, edited])
  useProjectLanguageService(workflowId, files, { reportUnresolvedImports: false })
  return null
}
