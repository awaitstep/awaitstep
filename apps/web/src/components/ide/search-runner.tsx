import { useMemo } from 'react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useWorkspaceSearch } from '../../hooks/use-workspace-search'
import { toSearchFiles } from '../../lib/ide/search'
import { useIdeSearchStore } from '../../stores/ide-search-store'

interface SearchRunnerProps {
  /** Every file as the editor has it, drafts included. */
  files: ReadonlyMap<string, GeneratedFile>
  /** Which of those files the project owns; the rest is generated. */
  projectPaths: ReadonlySet<string>
  /** Library modules' files: searched always, listed as Library. */
  libraryPaths?: ReadonlySet<string>
}

/**
 * Runs the search for the workspace, mounted for as long as it is open, so
 * results follow your edits even with the side bar hidden. The Search view
 * only displays them.
 */
export function SearchRunner({ files, projectPaths, libraryPaths }: SearchRunnerProps) {
  const includeGenerated = useIdeSearchStore((s) => s.includeGenerated)
  // Generated files are left out of the request, not just the list: the
  // worker is sent less to copy and less to read. Library code is code you
  // import, so it is searched whether or not generated files are.
  const searchable = useMemo(
    () =>
      toSearchFiles(files.values(), projectPaths, libraryPaths).filter(
        (f) => includeGenerated || !f.generated || f.library,
      ),
    [files, projectPaths, libraryPaths, includeGenerated],
  )
  useWorkspaceSearch(searchable)
  return null
}
