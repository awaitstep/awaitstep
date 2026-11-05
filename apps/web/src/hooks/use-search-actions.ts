import { useEffect, useMemo, useRef } from 'react'
import type { GeneratedFile } from '@awaitstep/codegen'
import {
  createImporterShower,
  editorSearchSeed,
  findInFiles,
  showSearch,
  stepSearchHit,
} from '../lib/ide/search-actions'
import { inForeignField, REFERENCE_PEEK } from '../lib/ide/key-ownership'

export interface SearchActions {
  findInFiles: () => void
  /** The palette's commands: with nothing to step to, they show Search instead. */
  nextSearchHit: () => void
  prevSearchHit: () => void
  /** The keys: declined (`false`) when there is nothing to step to or a peek is open. */
  nextSearchHitKey: (event?: KeyboardEvent) => void | false
  prevSearchHitKey: (event?: KeyboardEvent) => void | false
  showImporters: (specifier: string) => void
}

/**
 * The workspace's Search commands over the files as the editor has them.
 * The files are read when a command runs, not when it was built.
 */
export function useSearchActions(files: ReadonlyMap<string, GeneratedFile>): SearchActions {
  const filesRef = useRef(files)
  filesRef.current = files
  const importers = useMemo(() => createImporterShower(), [])
  useEffect(() => importers.dispose, [importers])

  return useMemo(() => {
    function step(direction: 1 | -1): boolean {
      return stepSearchHit(direction, filesRef.current)
    }
    function key(direction: 1 | -1, event?: KeyboardEvent): void | false {
      if (inForeignField(event?.target ?? null)) return false
      if (document.querySelector(REFERENCE_PEEK)) return false
      return step(direction) ? undefined : false
    }
    return {
      findInFiles: () => findInFiles(editorSearchSeed()),
      nextSearchHit: () => {
        if (!step(1)) showSearch()
      },
      prevSearchHit: () => {
        if (!step(-1)) showSearch()
      },
      nextSearchHitKey: (event) => key(1, event),
      prevSearchHitKey: (event) => key(-1, event),
      showImporters: importers.show,
    }
  }, [importers])
}
