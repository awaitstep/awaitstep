import { useEffect, useMemo } from 'react'
import { useMonaco } from '@monaco-editor/react'
import {
  libraryAcquisitionFiles,
  libraryRootOptions,
  mergeLibraryDependencies,
  registerNodeJsonSchema,
  type DependencyConflict,
} from '../lib/monaco/library-config'
import { useProjectLanguageService } from './use-project-language-service'

/**
 * One Monaco program for a place's library (D5): a model per loaded file,
 * `#modules/*` resolving to the module folders, npm types for every
 * module's and node's dependencies, and node.json checked against the
 * custom-node schema (D7). Returns the packages two manifests ask for at
 * different ranges, for the Problems list.
 */
export function useLibraryLanguageService(
  root: string,
  files: ReadonlyMap<string, { source: string }>,
): DependencyConflict[] {
  const monaco = useMonaco()
  const merged = useMemo(() => mergeLibraryDependencies(files), [files])
  const acquisitionFiles = useMemo(
    () => libraryAcquisitionFiles(files, merged.manifest),
    [files, merged.manifest],
  )
  const rootOptions = useMemo(() => libraryRootOptions(root), [root])
  useProjectLanguageService(root, files, {
    reportUnresolvedImports: true,
    rootOptions,
    acquisitionFiles,
  })
  useEffect(() => {
    if (monaco) registerNodeJsonSchema(monaco)
  }, [monaco])
  return merged.conflicts
}
