import { lazy, Suspense, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { useShallow } from 'zustand/react/shallow'
import { fileLanguage } from '../../lib/ide/file-tree'
import { filePathOfTab } from '../../lib/ide/tabs'
import { IDE_EDITOR_OPTIONS, IDE_READONLY_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { configureMonaco, parseWorkflowModelPath, workflowModelPath } from '../../lib/monaco/setup'
import { useMonacoTheme } from '../../lib/monaco/theme'
import { useIdeStore } from '../../stores/ide-store'
import type { LibrarySourceFile } from '../../hooks/use-library-sources'
import { EditorTabs } from '../ide/editor-tabs'
import { EditorPlaceholder } from '../ide/editor-placeholder'
import { LibraryFileBanner } from './library-file-banner'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

interface LibraryEditorProps {
  root: string
  files: ReadonlyMap<string, LibrarySourceFile>
  dirty: ReadonlySet<string>
  loading: ReadonlySet<string>
  isReadOnly: (path: string) => boolean
  readOnlyReason: string | null
  onRevertFile: (path: string) => void
  /** Typing in an editable file. */
  onChange: (path: string, text: string) => void
  onOverwrite: (path: string, serverHash: string | null) => void
  onCompare: (path: string) => void
}

/** The tabs and the one Monaco editor; the workspace owns every model (see `useLibraryLanguageService`). */
export function LibraryEditor({
  root,
  files,
  dirty,
  loading,
  isReadOnly,
  readOnlyReason,
  onRevertFile,
  onChange,
  onOverwrite,
  onCompare,
}: LibraryEditorProps) {
  const monacoTheme = useMonacoTheme()
  const { activePath, setCursor, setEditorHandle } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      setCursor: s.setCursor,
      setEditorHandle: s.setEditorHandle,
    })),
  )
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const activeFile = filePathOfTab(activePath)
  const file = activeFile ? files.get(activeFile) : undefined
  const readOnly = activeFile ? isReadOnly(activeFile) : true

  function handleMount(instance: editor.IStandaloneCodeEditor) {
    editorRef.current = instance
    instance.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column })
    })
    setEditorHandle({
      focus: () => instance.focus(),
      trigger: (actionId) => void instance.getAction(actionId)?.run(),
      searchSeed: () => null,
    })
    instance.onDidDispose(() => setEditorHandle(null))
  }

  // The file is the one whose model the editor holds now, not the render's
  // active file, which lags a model switch by one render.
  function handleChange(value: string | undefined) {
    const model = editorRef.current?.getModel()
    const path = model ? parseWorkflowModelPath(model.uri.toString())?.file : undefined
    if (!path || isReadOnly(path)) return
    onChange(path, value ?? '')
  }

  let body
  if (!activeFile) body = <EditorPlaceholder />
  else if (!file) {
    body = (
      <p className="p-6 text-xs text-muted-foreground">
        {loading.has(activeFile) ? 'Loading…' : 'This file isn’t here any more.'}
      </p>
    )
  } else {
    body = (
      <Suspense fallback={<div className="h-full bg-editor" />}>
        <MonacoEditor
          height="100%"
          path={workflowModelPath(root, file.path)}
          language={fileLanguage(file.path)}
          defaultValue={file.source}
          theme={monacoTheme}
          options={readOnly ? IDE_READONLY_EDITOR_OPTIONS : IDE_EDITOR_OPTIONS}
          keepCurrentModel
          beforeMount={configureMonaco}
          onMount={handleMount}
          onChange={handleChange}
        />
      </Suspense>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card">
        <EditorTabs files={files} dirty={dirty} onRevertFile={onRevertFile} />
      </div>
      {activeFile && file && (
        <LibraryFileBanner
          path={activeFile}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          onRevert={onRevertFile}
          onOverwrite={onOverwrite}
          onCompare={onCompare}
        />
      )}
      <div className="relative min-h-0 flex-1">{body}</div>
    </div>
  )
}
