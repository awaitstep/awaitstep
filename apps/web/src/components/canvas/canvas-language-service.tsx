import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiReady, useQueries } from '../../contexts/api-client-context'
import { useProjectLanguageService } from '../../hooks/use-project-language-service'
import { libraryFilesOf, storedFiles } from '../../lib/ide/project'
import type { SourceFile } from '../../lib/api-client'

const NO_FILES: ReadonlyMap<string, SourceFile> = new Map()

interface CanvasLanguageServiceProps {
  workflowId: string
  /** The `?version=` the canvas shows, so the files are that version's. */
  versionParam?: string
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
 * acquisition is Code's.
 */
export function CanvasLanguageService({ workflowId, versionParam }: CanvasLanguageServiceProps) {
  const queries = useQueries()
  const ready = useApiReady()
  const { data } = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  const files = useMemo(() => {
    if (!data) return NO_FILES
    const own = storedFiles<SourceFile>(data.files)
    // Library modules the bundle carries, so a step's `#modules/x` import
    // completes and type-checks here as it does in Code.
    const library = libraryFilesOf(
      data.files.map((file) => file.path),
      data.library ?? [],
    )
    for (const file of data.files) if (library.has(file.path)) own.set(file.path, file)
    return own
  }, [data])
  useProjectLanguageService(workflowId, files, { reportUnresolvedImports: false })
  return null
}
