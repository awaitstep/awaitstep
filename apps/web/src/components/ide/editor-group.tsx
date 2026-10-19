import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMonaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Lock } from 'lucide-react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import type { Editability } from '../../lib/ide/editability'
import { fileLanguage } from '../../lib/ide/file-tree'
import { disposeWorkflowModels, syncWorkflowModels } from '../../lib/monaco/models'
import { configureMonaco, parseWorkflowModelPath, workflowModelPath } from '../../lib/monaco/setup'
import { IDE_EDITOR_OPTIONS, IDE_READONLY_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { useWorkflowTypeContext } from '../../lib/monaco/use-workflow-type-context'
import { useIdeStore } from '../../stores/ide-store'
import { EditorPlaceholder } from './editor-placeholder'
import { EditorTabs } from './editor-tabs'
import { roleTitle } from './file-icon'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

interface EditorGroupProps {
  workflowId: string
  /** Baseline with drafts laid over it — what the editor shows. */
  files: ReadonlyMap<string, GeneratedFile>
  dirty: ReadonlySet<string>
  editabilityOf: (path: string) => Editability
  onChange: (path: string, source: string) => void
}

interface CursorPosition {
  line: number
  column: number
}

export function EditorGroup({
  workflowId,
  files,
  dirty,
  editabilityOf,
  onChange,
}: EditorGroupProps) {
  useWorkflowTypeContext()
  const monaco = useMonaco()
  const { activePath, reveal, clearReveal } = useIdeStore(
    useShallow((s) => ({ activePath: s.activePath, reveal: s.reveal, clearReveal: s.clearReveal })),
  )
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 })

  const activeFile = activePath ? files.get(activePath) : undefined
  const editability = activePath ? editabilityOf(activePath) : null

  // Models outlive editor mounts and the wrapper reuses them without
  // re-applying `value`, so keep this workflow's models in step with what
  // the editor should show (drafts included — a draft equals its model, so
  // typing never fights the sync) and drop them all when the workspace goes.
  useEffect(() => {
    if (monaco) syncWorkflowModels(monaco, workflowId, files)
  }, [monaco, workflowId, files])

  useEffect(() => {
    if (!monaco) return
    return () => {
      disposeWorkflowModels(monaco, workflowId)
    }
  }, [monaco, workflowId])

  // A reveal lands once the editor shows the requested file: right away if it
  // already does, otherwise from the model-change event after the swap.
  const applyReveal = useCallback(() => {
    const instance = editorRef.current
    const target = useIdeStore.getState().reveal
    if (!instance || !target) return
    const model = instance.getModel()
    if (!model || parseWorkflowModelPath(model.uri.toString())?.file !== target.path) return
    instance.revealLineInCenter(target.line)
    instance.setPosition({ lineNumber: target.line, column: target.column })
    instance.focus()
    clearReveal()
  }, [clearReveal])

  useEffect(() => {
    if (reveal) applyReveal()
  }, [reveal, applyReveal])

  function handleMount(instance: editor.IStandaloneCodeEditor) {
    editorRef.current = instance
    instance.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column })
    })
    instance.onDidChangeModel(applyReveal)
    applyReveal()
  }

  function handleChange(value: string | undefined) {
    if (activeFile) onChange(activeFile.path, value ?? '')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorTabs files={files} dirty={dirty} />
      <div className="min-h-0 flex-1">
        {activeFile && editability ? (
          <Suspense fallback={<div className="h-full bg-[oklch(0.12_0_0)]" />}>
            <MonacoEditor
              height="100%"
              path={workflowModelPath(workflowId, activeFile.path)}
              language={fileLanguage(activeFile.path)}
              value={activeFile.source}
              theme="vs-dark"
              options={editability.readOnly ? IDE_READONLY_EDITOR_OPTIONS : IDE_EDITOR_OPTIONS}
              beforeMount={configureMonaco}
              onMount={handleMount}
              onChange={handleChange}
            />
          </Suspense>
        ) : (
          <EditorPlaceholder />
        )}
      </div>
      <EditorStatusBar
        file={activeFile}
        cursor={cursor}
        editability={editability}
        dirty={activeFile ? dirty.has(activeFile.path) : false}
      />
    </div>
  )
}

function EditorStatusBar({
  file,
  cursor,
  editability,
  dirty,
}: {
  file: GeneratedFile | undefined
  cursor: CursorPosition
  editability: Editability | null
  dirty: boolean
}) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-[11px] text-muted-foreground/70">
      <div className="flex min-w-0 items-center gap-3">
        {file ? (
          <>
            <span className="truncate font-mono" title={file.path}>
              {file.path}
            </span>
            <span className="hidden shrink-0 sm:inline" title={roleTitle(file.role)}>
              {file.role}
            </span>
            {dirty && <span className="shrink-0 text-status-warning">Modified</span>}
          </>
        ) : (
          <span>No file open</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {editability?.readOnly && (
          <span className="inline-flex items-center gap-1" title={editability.message ?? undefined}>
            <Lock className="h-3 w-3" />
            Read-only
          </span>
        )}
        {file && (
          <>
            <span className="tabular-nums">
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span>{fileLanguage(file.path)}</span>
          </>
        )}
      </div>
    </div>
  )
}
