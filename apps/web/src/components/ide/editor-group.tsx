import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { useMonaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import type { Editability } from '../../lib/ide/editability'
import { fileLanguage } from '../../lib/ide/file-tree'
import { compareTabPath, filePathOfTab, tabKind } from '../../lib/ide/tabs'
import { disposeWorkflowModels, syncWorkflowModels } from '../../lib/monaco/models'
import { projectRootOptions, tsconfigEditorOptions } from '../../lib/monaco/project-config'
import { disposeProjectLibs, syncProjectLibs } from '../../lib/monaco/project-libs'
import {
  configureMonaco,
  languageHosts,
  parseWorkflowModelPath,
  setProjectCompilerOptions,
  setProjectDiagnostics,
  workflowModelPath,
} from '../../lib/monaco/setup'
import { useTypeAcquisition } from '../../lib/monaco/use-type-acquisition'
import { useMonacoTheme } from '../../lib/monaco/theme'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { IDE_EDITOR_OPTIONS, IDE_READONLY_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { useWorkflowTypeContext } from '../../lib/monaco/use-workflow-type-context'
import { searchSeedOf } from '../../lib/ide/editor-seed'
import { useIdeStore } from '../../stores/ide-store'
import { EditorPlaceholder } from './editor-placeholder'
import { CompareView } from './compare-view'
import { EditorFileBanner } from './editor-file-banner'
import { EmptyFileHint, ScheduleBanner } from './new-file-notices'
import { HANDLER_SCHEDULED_PATH } from '@awaitstep/ir'
import { importSpecifier } from '../../lib/ide/project'
import { FileStateBanner } from './file-state-banner'
import type { ReviewBindings } from './review-bindings'
import { ReviewView } from './review-view'
import { EditorTabs } from './editor-tabs'
import { RestoredDraftsBanner } from './restored-drafts-banner'
import { RunButton, type RunButtonProps } from './run-button'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

/** How long typing must pause before project-wide work (lib sync, type acquisition) runs. */
const WORKER_SYNC_DELAY_MS = 600

interface EditorGroupProps {
  workflowId: string
  /** Baseline with drafts laid over it — what the editor shows. */
  files: ReadonlyMap<string, GeneratedFile>
  dirty: ReadonlySet<string>
  editabilityOf: (path: string) => Editability
  onChange: (path: string, source: string) => void
  /** Drops one file's unsaved edits (the tab menu's Revert file). */
  onRevertFile: (path: string) => void
  /** Files that come from legacy settings and are not stored yet. */
  virtualPaths: ReadonlySet<string>
  /** The workspace is showing an older version. */
  historical: boolean
  onOpenLatest: () => void
  onSaveAsFile: (path: string) => void
  onConvertHandlers: () => void
  onOpenCanvas: () => void
  /** `handlers/scheduled.ts` is open with no schedule behind it. */
  scheduleMissing: boolean
  run: RunButtonProps
  /** The Unsaved changes and Compare tabs, and the banners about outside changes. */
  review: ReviewBindings
}

export function EditorGroup({
  workflowId,
  files,
  dirty,
  editabilityOf,
  onChange,
  onRevertFile,
  virtualPaths,
  historical,
  onOpenLatest,
  onSaveAsFile,
  onConvertHandlers,
  onOpenCanvas,
  scheduleMissing,
  run,
  review,
}: EditorGroupProps) {
  useWorkflowTypeContext()
  const monacoTheme = useMonacoTheme()
  const monaco = useMonaco()
  const {
    activePath,
    reveal,
    clearReveal,
    focusRequested,
    consumeEditorFocus,
    setCursor,
    setEditorHandle,
  } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      reveal: s.reveal,
      focusRequested: s.editorFocusRequested,
      consumeEditorFocus: s.consumeEditorFocus,
      clearReveal: s.clearReveal,
      setCursor: s.setCursor,
      setEditorHandle: s.setEditorHandle,
    })),
  )
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  // The review and Compare tabs are not files: they have no model here.
  const activeFilePath = filePathOfTab(activePath)
  const activeFile = activeFilePath ? files.get(activeFilePath) : undefined
  const editability = activeFilePath ? editabilityOf(activeFilePath) : null
  const activeKind = activePath ? tabKind(activePath) : null

  // Every file is a model (created up front, not when its tab opens) so
  // TypeScript sees the whole project: imports resolve across files and
  // Problems covers files nobody has opened. The sync keeps the models in
  // step with what the editor should show (drafts included — a draft
  // equals its model, so typing never fights the sync); everything is
  // dropped when the workspace goes.
  useEffect(() => {
    if (monaco) syncWorkflowModels(monaco, workflowId, files)
  }, [monaco, workflowId, files])

  // Everything below restarts the language workers when it changes, so it
  // follows the files only once typing has paused.
  const settledFiles = useDebouncedValue(files, WORKER_SYNC_DELAY_MS)

  // JSON declarations and, in a mixed project, each language's files for
  // the other service.
  useEffect(() => {
    if (monaco) syncProjectLibs(languageHosts(monaco), workflowId, settledFiles)
  }, [monaco, workflowId, settledFiles])

  // The project is one TypeScript program rooted at the workflow: `#app/*`
  // and relative imports resolve between its models, and a project
  // tsconfig.json (or jsconfig.json) may turn on strictness switches.
  const configSource =
    settledFiles.get('tsconfig.json')?.source ?? settledFiles.get('jsconfig.json')?.source
  useEffect(() => {
    if (!monaco) return
    setProjectCompilerOptions(monaco, {
      ...projectRootOptions(workflowId),
      ...tsconfigEditorOptions(configSource),
    })
  }, [monaco, workflowId, configSource])

  // npm packages get real declarations; "Cannot find module" only counts
  // once every package in view has been typed or stubbed. Keyed on the
  // workflow as well, so a workspace that opens after another's cleanup
  // muted the errors always re-applies its own state.
  const typesSettled = useTypeAcquisition(settledFiles)
  useEffect(() => {
    if (monaco) setProjectDiagnostics(monaco, { reportUnresolvedImports: typesSettled })
  }, [monaco, workflowId, typesSettled])

  useEffect(() => {
    if (!monaco) return
    return () => {
      setProjectDiagnostics(monaco, null)
      setProjectCompilerOptions(monaco, null)
      disposeProjectLibs(workflowId)
      disposeWorkflowModels(monaco, workflowId)
    }
  }, [monaco, workflowId])

  // A reveal lands once the editor shows the requested file and the wrapper
  // is done with it: right away if it already does, otherwise after the swap.
  // The wrapper swaps models and then restores the file's saved view state
  // (its last cursor and scroll), which would overwrite the reveal if it
  // landed first; see `handleMount` for how the swap is waited out.
  const applyReveal = useCallback(() => {
    const instance = editorRef.current
    const target = useIdeStore.getState().reveal
    if (!instance || !target) return
    const model = instance.getModel()
    if (!model || parseWorkflowModelPath(model.uri.toString())?.file !== target.path) return
    // The range, not just the line: a match far along a long line scrolls
    // sideways into view.
    instance.revealRangeInCenter({
      startLineNumber: target.line,
      startColumn: target.column,
      endLineNumber: target.line,
      endColumn: target.endColumn ?? target.column,
    })
    if (target.endColumn !== undefined) {
      // A search hit: select the match so the next keystroke replaces it.
      instance.setSelection({
        startLineNumber: target.line,
        startColumn: target.column,
        endLineNumber: target.line,
        endColumn: target.endColumn,
      })
    } else {
      instance.setPosition({ lineNumber: target.line, column: target.column })
    }
    instance.focus()
    clearReveal()
  }, [clearReveal])

  // Child effects run first, so by the time this runs for a new file the
  // wrapper has swapped models and restored that file's view state.
  useEffect(() => {
    if (reveal) applyReveal()
  }, [reveal, activePath, applyReveal])

  // A request to focus lands once the editor holds the active file's model,
  // like a reveal: the editor mounted for it a moment ago, or is swapping to it.
  const applyFocus = useCallback(() => {
    const instance = editorRef.current
    const { editorFocusRequested, activePath: active } = useIdeStore.getState()
    const wanted = filePathOfTab(active)
    if (!instance || !editorFocusRequested || wanted === null) return
    const model = instance.getModel()
    if (!model || parseWorkflowModelPath(model.uri.toString())?.file !== wanted) return
    instance.focus()
    consumeEditorFocus()
  }, [consumeEditorFocus])

  useEffect(() => {
    if (!focusRequested) return
    // Moved to a tab with no file editor before it could land: drop it, or it
    // would take the keyboard at some later, unrelated moment.
    if (filePathOfTab(activePath) === null) consumeEditorFocus()
    else applyFocus()
  }, [focusRequested, activePath, applyFocus, consumeEditorFocus])

  function handleMount(instance: editor.IStandaloneCodeEditor) {
    editorRef.current = instance
    instance.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column })
    })
    setEditorHandle({
      focus: () => instance.focus(),
      trigger: (actionId) => void instance.getAction(actionId)?.run(),
      searchSeed: (ignoreFocus) => searchSeedOf(instance, ignoreFocus),
    })
    // Switching models fires no cursor event, so read the caret afresh.
    function syncCursor() {
      const position = instance.getPosition()
      if (position) setCursor({ line: position.lineNumber, column: position.column })
    }
    instance.onDidChangeModel(() => {
      syncCursor()
      // This fires inside the wrapper's `setModel`, before it restores the
      // file's old view state. A microtask lands after both.
      queueMicrotask(() => {
        syncCursor()
        applyReveal()
        applyFocus()
      })
    })
    instance.onDidDispose(() => setEditorHandle(null))
    syncCursor()
    applyReveal()
    applyFocus()
  }

  // The file is the one whose model the editor holds right now — not the
  // active file of the render that registered this handler, which is one
  // render behind while the wrapper switches models. Edits that reach a
  // read-only file can only be the wrapper's own writes and are ignored.
  function handleChange(value: string | undefined) {
    const model = editorRef.current?.getModel()
    const path = model ? parseWorkflowModelPath(model.uri.toString())?.file : undefined
    if (!path || editabilityOf(path).readOnly) return
    onChange(path, value ?? '')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RestoredDraftsBanner onCompare={review.onCompare} />
      <div className="flex shrink-0 items-stretch border-b border-border bg-card">
        <div className="min-w-0 flex-1">
          <EditorTabs files={files} dirty={dirty} onRevertFile={onRevertFile} />
        </div>
        <RunButton {...run} />
      </div>
      {activeFile && editability && (
        <EditorFileBanner
          path={activeFile.path}
          editability={editability}
          isVirtual={virtualPaths.has(activeFile.path)}
          historical={historical}
          onOpenLatest={onOpenLatest}
          onSaveAsFile={onSaveAsFile}
          onConvertHandlers={onConvertHandlers}
          onOpenCanvas={onOpenCanvas}
        />
      )}
      {activeFile &&
        editability &&
        !editability.readOnly &&
        scheduleMissing &&
        activeFile.path === HANDLER_SCHEDULED_PATH && (
          <ScheduleBanner onOpenCanvas={onOpenCanvas} />
        )}
      {activeFile && <FileStateBanner path={activeFile.path} bindings={review} />}
      <div className="relative min-h-0 flex-1">
        {activeKind === 'file' &&
          activeFile &&
          editability &&
          !editability.readOnly &&
          activeFile.source === '' &&
          importSpecifier(activeFile.path) && <EmptyFileHint path={activeFile.path} />}
        {activeKind === 'review' ? (
          <ReviewView bindings={review} />
        ) : activeKind === 'compare' && activePath ? (
          <CompareView key={activePath} path={compareTabPath(activePath)!} bindings={review} />
        ) : activeFile && editability ? (
          <Suspense fallback={<div className="h-full bg-editor" />}>
            <MonacoEditor
              height="100%"
              path={workflowModelPath(workflowId, activeFile.path)}
              language={fileLanguage(activeFile.path)}
              // Only for a model that does not exist yet; the workspace owns
              // model text (sync + drafts). A `value` prop would let the
              // wrapper write into whichever model it holds mid-switch.
              defaultValue={activeFile.source}
              theme={monacoTheme}
              options={editability.readOnly ? IDE_READONLY_EDITOR_OPTIONS : IDE_EDITOR_OPTIONS}
              // The workspace owns the models: closing the last tab must not
              // drop the file from the type program.
              keepCurrentModel
              beforeMount={configureMonaco}
              onMount={handleMount}
              onChange={handleChange}
            />
          </Suspense>
        ) : (
          <EditorPlaceholder />
        )}
      </div>
    </div>
  )
}
