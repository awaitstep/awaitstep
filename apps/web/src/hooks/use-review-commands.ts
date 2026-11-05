import { useMemo, useRef } from 'react'
import type { SourceFile } from '../lib/api-client'
import { actionToast } from '../lib/action-toast'
import type { IdeCommandActions } from '../lib/ide/commands'
import type { DraftUndo } from '../lib/ide/draft-undo'
import type { Drafts } from '../lib/ide/drafts'
import { outsideState } from '../lib/ide/outside-changes'
import { useIdeStore } from '../stores/ide-store'
import type { ReviewBindings } from '../components/ide/review-bindings'
import { activeTargetPath } from './use-review-actions'
import type { ProjectFilesController } from './use-project-files'

interface ReviewCommandsInput {
  baseline: ReadonlyMap<string, SourceFile>
  activePath: string | null
  reviewPath: string | null
  drafts: Drafts
  dirty: ReadonlySet<string>
  canEdit: boolean
  readOnlyMessage: string | null
  projectFiles: ProjectFilesController
  draftUndo: DraftUndo
  /** Opens Compare the way the views do, so it starts from the server's current copy. */
  onCompare: ReviewBindings['onCompare']
}

type ReviewCommands = Pick<
  IdeCommandActions,
  'save' | 'revertFile' | 'reviewChanges' | 'compareFile'
>

/**
 * The palette and shortcut commands that act on "the file in front of the
 * person" (Save, Revert, Compare), plus what the palette needs to know about
 * that file. For the review and Compare tabs that file is not the tab's own
 * id, so it is resolved at the moment a command fires.
 */
export function useReviewCommands(input: ReviewCommandsInput) {
  const { baseline, activePath, reviewPath, drafts, dirty } = input
  const { canEdit, readOnlyMessage, projectFiles, draftUndo, onCompare } = input
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline

  const targetPath = activeTargetPath(baseline, { activePath, drafts, reviewPath })
  const activeDirty = targetPath !== null && dirty.has(targetPath)
  const activeMovedOnServer =
    targetPath !== null && outsideState(baseline, targetPath, drafts[targetPath]) === 'changed'

  const commands = useMemo<ReviewCommands>(() => {
    function target(): string | null {
      return activeTargetPath(baselineRef.current, useIdeStore.getState())
    }
    return {
      save: () => {
        if (!canEdit) {
          if (readOnlyMessage) actionToast.info(readOnlyMessage)
          return
        }
        const path = target()
        if (path) void projectFiles.saveFile(path)
      },
      revertFile: () => {
        const path = target()
        if (path) draftUndo.revertFile(path)
      },
      reviewChanges: () => useIdeStore.getState().openReview(),
      compareFile: () => {
        const path = target()
        if (path) onCompare(path)
      },
    }
  }, [canEdit, readOnlyMessage, projectFiles, draftUndo, onCompare])

  return { activeDirty, activeMovedOnServer, commands }
}
