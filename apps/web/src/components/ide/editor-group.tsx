import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { useMonaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import type { Editability } from '../../lib/ide/editability'
import { fileLanguage } from '../../lib/ide/file-tree'
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
import { useIdeStore } from '../../stores/ide-store'
import { EditorPlaceholder } from './editor-placeholder'
import { EditorFileBanner } from './editor-file-banner'
import { EditorTabs } from './editor-tabs'
import { RestoredDraftsBanner } from './restored-drafts-banner'

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
}: EditorGroupProps) {
  useWorkflowTypeContext()
  const monacoTheme = useMonacoTheme()
  const monaco = useMonaco()
  const { activePath, reveal, clearReveal, setCursor, setEditorHandle } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      reveal: s.reveal,
      clearReveal: s.clearReveal,
      setCursor: s.setCursor,
      setEditorHandle: s.setEditorHandle,
    })),
  )
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const activeFile = activePath ? files.get(activePath) : undefined
  const editability = activePath ? editabilityOf(activePath) : null

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
      })
    })
    instance.onDidDispose(() => setEditorHandle(null))
    syncCursor()
    applyReveal()
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
      <RestoredDraftsBanner />
      <EditorTabs files={files} dirty={dirty} onRevertFile={onRevertFile} />
      {activeFile && editability && (
        <EditorFileBanner
          path={activeFile.path}
          editability={editability}
          isVirtual={virtualPaths.has(activeFile.path)}
          historical={historical}
          onOpenLatest={onOpenLatest}
          onSaveAsFile={onSaveAsFile}
          onConvertHandlers={onConvertHandlers}
        />
      )}
      <div className="min-h-0 flex-1">
        {activeFile && editability ? (
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

/**
 * The single-line selection, else the word at the caret. Null while the
 * editor lacks focus, unless `ignoreFocus`: the palette has the keyboard
 * when its command runs, but the editor still holds its selection.
 */
function searchSeedOf(instance: editor.IStandaloneCodeEditor, ignoreFocus = false): string | null {
  if (!ignoreFocus && !instance.hasTextFocus()) return null
  const model = instance.getModel()
  const selection = instance.getSelection()
  if (!model || !selection) return ''
  if (!selection.isEmpty()) {
    return selection.startLineNumber === selection.endLineNumber
      ? model.getValueInRange(selection)
      : ''
  }
  return model.getWordAtPosition(selection.getPosition())?.word ?? ''
}
