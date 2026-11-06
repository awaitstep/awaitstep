import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiReady, useQueries } from '../../contexts/api-client-context'
import { useProjectLanguageService } from '../../hooks/use-project-language-service'
import { storedFiles } from '../../lib/ide/project'
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
 * time. Only the stored files (the ones a person wrote) are loaded, not the
 * generated bundle, and "Cannot find module" stays muted as before: type
 * acquisition is Code's.
 */
export function CanvasLanguageService({ workflowId, versionParam }: CanvasLanguageServiceProps) {
  const queries = useQueries()
  const ready = useApiReady()
  const { data } = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  const files = useMemo(() => (data ? storedFiles(data.files) : NO_FILES), [data])
  useProjectLanguageService(workflowId, files, { reportUnresolvedImports: false })
  return null
}
