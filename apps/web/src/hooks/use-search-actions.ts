import { useEffect, useMemo, useRef } from 'react'
import type { GeneratedFile } from '@awaitstep/codegen'
import {
  createImporterShower,
  editorSearchSeed,
  findInFiles,
  showSearch,
  stepSearchHit,
} from '../lib/ide/search-actions'

/** Monaco's reference peek owns F4 and ⇧F4 while it is open. */
const REFERENCE_PEEK = '.peekview-widget'

/**
 * A text field of its own (the Search box, Monaco's find or rename input, a
 * quick-test field) keeps F4: stepping would select a match in the editor
 * and the next keystroke would replace it. The editor's own text area (and
 * its edit context) and the results list are fine.
 */
const FOREIGN_FIELD =
  'input, textarea:not(.inputarea), select, [contenteditable=""], [contenteditable="true"]:not(.native-edit-context)'

function inForeignField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FOREIGN_FIELD) !== null
}

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
