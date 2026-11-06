import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceFile } from '../lib/api-client'
import type { GeneratedFile } from '@awaitstep/codegen'
import type { DraftUndo } from '../lib/ide/draft-undo'
import { dirtyPaths } from '../lib/ide/drafts'
import type { Editability } from '../lib/ide/editability'
import type { FileOwner } from '../lib/ide/project'
import { basename } from '../lib/ide/file-tree'
import { currentReviewPath, reviewOrder } from '../lib/ide/review'
import { compareTabId, compareTabPath, filePathOfTab, REVIEW_TAB_ID } from '../lib/ide/tabs'
import { useIdeStore } from '../stores/ide-store'
import type { ReviewBindings } from '../components/ide/review-bindings'
import type { ProjectFilesController } from './use-project-files'

interface ReviewActionsInput {
  workflowId: string
  files: ReadonlyMap<string, GeneratedFile>
  baseline: ReadonlyMap<string, SourceFile>
  canEdit: boolean
  projectFiles: ProjectFilesController
  draftUndo: DraftUndo
  editabilityOf: (path: string) => Editability
  ownerOf: (path: string) => FileOwner
  onChange: (path: string, source: string) => void
}

/**
 * The file the active tab is about: the file itself, a Compare tab's file, or
 * the file the Unsaved changes tab is showing. Null when there is none, so
 * Save and Revert from the keyboard act on what is on screen in every tab.
 */
export function activeTargetPath(
  baseline: ReadonlyMap<string, SourceFile>,
  session: {
    activePath: string | null
    drafts: Parameters<typeof dirtyPaths>[1]
    reviewPath: string | null
  },
): string | null {
  const { activePath } = session
  if (activePath === null) return null
  if (activePath === REVIEW_TAB_ID) {
    return currentReviewPath(
      reviewOrder(dirtyPaths(baseline, session.drafts)),
      session.reviewPath,
      (path) => baseline.has(path),
    )
  }
  return compareTabPath(activePath) ?? filePathOfTab(activePath)
}

/** Wires the Unsaved changes view, Compare and the outside-change banners to the workspace's writes. */
export function useReviewActions(input: ReviewActionsInput) {
  const queryClient = useQueryClient()
  const { workflowId, files, baseline, canEdit, projectFiles, draftUndo } = input
  const { editabilityOf, ownerOf, onChange } = input

  const bindings = useMemo<ReviewBindings>(
    () => ({
      workflowId,
      files,
      baseline,
      canEdit,
      busy: projectFiles.busy,
      editabilityOf,
      ownerOf,
      onChange,
      onRevert: draftUndo.revertFile,
      onSave: projectFiles.saveFile,
      onSaveAll: () => void projectFiles.saveAll(),
      onCompare: (path) => {
        const session = useIdeStore.getState()
        // A Compare tab that is still open keeps the copy it loaded; opening it
        // afresh starts from what the server holds now.
        if (!session.openPaths.includes(compareTabId(path))) {
          queryClient.removeQueries({ queryKey: ['ide-compare', workflowId, path], exact: true })
        }
        session.openCompare(path)
      },
      onOverwrite: projectFiles.overwriteFile,
      onUseServerVersion: (path, loadedHash) => {
        const theirs = ownerOf(path) === 'step' ? 'canvas' : 'server'
        draftUndo.takeServerVersion(path, `Switched ${basename(path)} to the ${theirs} version.`)
        // Compare read the copy itself; make the editor show that same copy.
        if (loadedHash !== (baseline.get(path)?.hash ?? null)) void projectFiles.refresh()
      },
      onRecreate: projectFiles.recreateFile,
      onDiscardDeleted: draftUndo.discardDeleted,
    }),
    [
      workflowId,
      files,
      baseline,
      canEdit,
      projectFiles,
      draftUndo,
      editabilityOf,
      ownerOf,
      onChange,
      queryClient,
    ],
  )

  return bindings
}
