import { useMemo } from 'react'
import type { SourceFile } from '../lib/api-client'
import { overlayDrafts, type Drafts } from '../lib/ide/drafts'
import { deletedOutsideFiles, deletedOutsidePaths } from '../lib/ide/outside-changes'

/**
 * The files as the editor shows them, and which of them are the project's own.
 *
 * A file deleted on the server while it holds unsaved edits stays: its tab,
 * text and model remain, and a banner asks what to do with it. It counts as a
 * project file so it stays editable and can be saved again. The paths are
 * keyed as one string so a keystroke elsewhere does not rebuild what
 * depends on them.
 */
export function useDraftOverlay(
  baseline: ReadonlyMap<string, SourceFile>,
  drafts: Drafts,
  savedProjectPaths: ReadonlySet<string>,
) {
  const ghostKey = deletedOutsidePaths(baseline, drafts).join('\n')
  const ghostPaths = useMemo(() => (ghostKey ? ghostKey.split('\n') : []), [ghostKey])
  const projectPaths = useMemo(
    () =>
      ghostPaths.length === 0 ? savedProjectPaths : new Set([...savedProjectPaths, ...ghostPaths]),
    [savedProjectPaths, ghostPaths],
  )
  const files = useMemo(() => {
    const overlaid = overlayDrafts(baseline, drafts)
    const ghosts = deletedOutsideFiles(baseline, drafts)
    if (ghosts.length === 0) return overlaid
    const merged = new Map<string, SourceFile>(overlaid)
    for (const ghost of ghosts) merged.set(ghost.path, ghost)
    return merged
  }, [baseline, drafts])
  return { files, projectPaths, ghostPaths }
}
