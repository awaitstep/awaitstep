import { useMemo } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { actionToast } from '../lib/action-toast'
import type { SourceFile } from '../lib/api-client'
import type { IdeCommandActions } from '../lib/ide/commands'
import type { DraftUndo } from '../lib/ide/draft-undo'
import type { Editability } from '../lib/ide/editability'
import { runShortcut } from '../lib/ide/key-ownership'
import { filePathOfTab } from '../lib/ide/tabs'
import { showStepsView } from '../lib/ide/step-actions'
import { copyToClipboard } from '../lib/utils'
import { useIdeExplorerStore } from '../stores/ide-explorer-store'
import { useIdeLayoutStore } from '../stores/ide-layout-store'
import { useIdeStore } from '../stores/ide-store'
import type { GeneratedFile } from '@awaitstep/codegen'
import type { ProjectFilesController } from './use-project-files'
import type { SearchActions } from './use-search-actions'
import { useIdeShortcuts } from './use-ide-shortcuts'
import { useReviewActions } from './use-review-actions'
import { useReviewCommands } from './use-review-commands'
import { useSwitchView } from './use-switch-view'

const NO_SHORTCUTS = {}

type SessionActions = Pick<
  IdeCommandActions,
  'run' | 'startSession' | 'stopSession' | 'triggerSession'
>

interface WorkspaceActionsInput {
  workflowId: string
  versionParam: string | undefined
  /** False in a narrow window: the workspace is not shown, so no shortcut may act. */
  wideEnough: boolean
  canEdit: boolean
  readOnlyMessage: string | null
  baseline: ReadonlyMap<string, SourceFile>
  files: ReadonlyMap<string, GeneratedFile>
  dirty: ReadonlySet<string>
  storedPaths: ReadonlySet<string>
  editabilityOf: (path: string) => Editability
  projectFiles: ProjectFilesController
  searchActions: SearchActions
  draftUndo: DraftUndo
  sessionActions: SessionActions
}

/**
 * What the person can do in the workspace: the command list behind the
 * palette and the shortcuts, the shortcut wiring itself, and the small
 * handlers the panes call. All of them act on the stores at the moment they
 * run, so none holds a stale tab or draft.
 */
export function useWorkspaceActions({
  workflowId,
  versionParam,
  wideEnough,
  canEdit,
  readOnlyMessage,
  baseline,
  files,
  dirty,
  storedPaths,
  editabilityOf,
  projectFiles,
  searchActions,
  draftUndo,
  sessionActions,
}: WorkspaceActionsInput) {
  const router = useRouter()
  const switchView = useSwitchView(workflowId)
  const activePath = useIdeStore((s) => s.activePath)
  const reviewPath = useIdeStore((s) => s.reviewPath)
  const drafts = useIdeStore((s) => s.drafts)
  const requestClose = useIdeStore((s) => s.requestClose)
  const cycleFile = useIdeStore((s) => s.cycleFile)
  const setDraft = useIdeStore((s) => s.setDraft)
  const clearDraft = useIdeStore((s) => s.clearDraft)
  const showDialog = useIdeStore((s) => s.showDialog)
  const toggleExplorer = useIdeLayoutStore((s) => s.toggleExplorer)
  const toggleDock = useIdeLayoutStore((s) => s.toggleDock)
  const togglePreview = useIdeLayoutStore((s) => s.togglePreview)
  const showDock = useIdeLayoutStore((s) => s.showDock)

  // Text equal to the baseline is not a draft: keeping it would let a stale
  // "edit" survive an agent's later change and overwrite it on save.
  function handleEditorChange(path: string, text: string) {
    if (baseline.get(path)?.source === text) clearDraft(path)
    else setDraft(path, text, baseline.get(path)?.hash ?? null)
  }

  const review = useReviewActions({
    workflowId,
    files,
    baseline,
    canEdit,
    projectFiles,
    draftUndo,
    editabilityOf,
    onChange: handleEditorChange,
  })

  const {
    activeDirty,
    activeMovedOnServer,
    commands: reviewCommands,
  } = useReviewCommands({
    baseline,
    activePath,
    reviewPath,
    drafts,
    dirty,
    canEdit,
    readOnlyMessage,
    projectFiles,
    draftUndo,
    onCompare: review.onCompare,
  })

  const actions = useMemo<IdeCommandActions>(
    () => ({
      ...reviewCommands,
      saveAll: () => {
        if (canEdit) void projectFiles.saveAll()
      },
      discardChanges: draftUndo.discardAll,
      newFile: () => {
        if (!canEdit) return
        // The name row lives in the Explorer: show that view first, whether
        // the side bar is hidden or showing Search.
        useIdeLayoutStore.getState().showSideBar('explorer')
        useIdeExplorerStore.getState().beginCreate()
      },
      renameFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('renameFile', path)
      },
      deleteFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('deleteFile', path)
      },
      convertHandlers: () => {
        if (!canEdit) return
        // The server converts what it has stored, so an unsaved handlers.ts
        // is saved before the plan is drawn up: the dialog then describes
        // the conversion that will actually run.
        if (!useIdeStore.getState().drafts[PROJECT_HANDLERS_PATH]) {
          showDialog('convertHandlers')
          return
        }
        void projectFiles.saveFile(PROJECT_HANDLERS_PATH).then((saved) => {
          if (saved) showDialog('convertHandlers')
        })
      },
      quickOpen: () => showDialog('quickOpen'),
      findInFiles: searchActions.findInFiles,
      nextSearchHit: searchActions.nextSearchHit,
      prevSearchHit: searchActions.prevSearchHit,
      switchToCanvas: () => void switchView('canvas', { version: versionParam }),
      closeActiveFile: () => {
        const path = useIdeStore.getState().activePath
        if (path) requestClose([path])
      },
      closeAllFiles: () => requestClose(useIdeStore.getState().openPaths),
      copyActivePath: () => {
        const path = filePathOfTab(useIdeStore.getState().activePath)
        if (!path) return
        copyToClipboard(path)
          .then(() => actionToast.success('Path copied'))
          .catch(() => actionToast.error('Couldn’t copy the path'))
      },
      toggleExplorer,
      toggleDock,
      togglePreview,
      showProblems: () => showDock('problems'),
      showTestSession: () => showDock('session'),
      showQuickTest: () => showDock('quickTest'),
      showSteps: showStepsView,
      ...sessionActions,
    }),
    [
      reviewCommands,
      canEdit,
      projectFiles,
      storedPaths,
      searchActions,
      switchView,
      versionParam,
      requestClose,
      draftUndo,
      toggleExplorer,
      toggleDock,
      togglePreview,
      showDock,
      showDialog,
      sessionActions,
    ],
  )

  useIdeShortcuts(
    !wideEnough
      ? NO_SHORTCUTS
      : {
          save: actions.save,
          saveAll: actions.saveAll,
          newFile: actions.newFile,
          quickOpen: actions.quickOpen,
          commandPalette: () => showDialog('palette'),
          toggleExplorer,
          toggleDock,
          togglePreview,
          nextTab: () => cycleFile(1),
          prevTab: () => cycleFile(-1),
          closeTab: actions.closeActiveFile,
          // ⌥⏎ is Run, unless typed into a field of its own or Monaco's find widget.
          run: runShortcut(actions.run),
          findInFiles: actions.findInFiles,
          nextSearchHit: searchActions.nextSearchHitKey,
          prevSearchHit: searchActions.prevSearchHitKey,
        },
  )

  function handleRenameRequest(path: string) {
    showDialog('renameFile', path)
  }

  function handleDeleteRequest(path: string) {
    showDialog('deleteFile', path)
  }

  function handleConvertRequest() {
    actions.convertHandlers()
  }

  // A new file opens at line 1 with the caret in it; the toast comes from the action.
  async function handleCreateFile(path: string, fileSource?: string): Promise<boolean> {
    const created = await projectFiles.createFile(path, fileSource)
    if (created) useIdeStore.getState().revealLocation({ path, line: 1, column: 1 })
    return created
  }

  function handleRevertFile(path: string) {
    draftUndo.revertFile(path)
  }

  function handleFocusEditor() {
    useIdeStore.getState().editorHandle?.focus()
  }

  function handleOpenLatest() {
    void switchView('ide')
  }

  function handleOpenCanvas() {
    void switchView('canvas', { version: versionParam })
  }

  function handleReview(path?: string) {
    useIdeStore.getState().openReview(path)
  }

  function handleBack() {
    router.history.back()
  }

  function handleSaveAsFile(path: string) {
    void projectFiles.saveFile(path)
  }

  function handleShowSession() {
    showDock('session')
  }

  function handleShowProblems() {
    showDock('problems')
  }

  return {
    actions,
    review,
    activeDirty,
    activeMovedOnServer,
    handleEditorChange,
    handleRenameRequest,
    handleDeleteRequest,
    handleConvertRequest,
    handleCreateFile,
    handleRevertFile,
    handleFocusEditor,
    handleOpenLatest,
    handleOpenCanvas,
    handleReview,
    handleBack,
    handleSaveAsFile,
    handleShowSession,
    handleShowProblems,
  }
}
