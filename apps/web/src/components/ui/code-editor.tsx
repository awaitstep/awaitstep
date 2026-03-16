import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CF_WORKFLOW_TYPE_DEFS } from '../../lib/cf-workflow-types'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

let typesInjected = false

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  height?: string
  bordered?: boolean
  expandable?: boolean
  title?: string
}

function injectTypes(monaco: Parameters<Exclude<React.ComponentProps<typeof MonacoEditor>['beforeMount'], undefined>>[0]) {
  if (!typesInjected) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      CF_WORKFLOW_TYPE_DEFS,
      'cf-workflow-globals.d.ts',
    )
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      CF_WORKFLOW_TYPE_DEFS,
      'cf-workflow-globals.d.ts',
    )
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowJs: true,
      checkJs: false,
      strict: false,
      noEmit: true,
      allowNonTsExtensions: true,
    })
    typesInjected = true
  }
}

const editorOptions = {
  minimap: { enabled: false },
  fontSize: 11,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 6, bottom: 6 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'none' as const,
  scrollbar: { vertical: 'auto' as const, horizontal: 'hidden' as const, verticalScrollbarSize: 6 },
  lineNumbersMinChars: 3,
  folding: false,
  glyphMargin: false,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
}

export function CodeEditor({ value, onChange, language = 'typescript', height = '200px', bordered = true, expandable = true, title }: CodeEditorProps) {
  const [mounted, setMounted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [fullscreen])

  if (!mounted) {
    return (
      <div style={{ height }} className={cn('flex items-center justify-center overflow-hidden bg-[oklch(0.12_0_0)] text-xs text-white/30', bordered && 'rounded-lg border border-input')}>
        Loading editor...
      </div>
    )
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[oklch(0.10_0_0)]" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[oklch(0.13_0_0)] px-4">
          <span className="text-xs font-medium text-white/60">{title ?? 'Code Editor'}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/25">ESC to close</span>
            <button
              onClick={() => setFullscreen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/80"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1">
          <Suspense fallback={null}>
            <MonacoEditor
              height="100%"
              language={language}
              value={value}
              onChange={(v) => onChangeRef.current(v ?? '')}
              theme="vs-dark"
              beforeMount={injectTypes}
              options={{
                ...editorOptions,
                fontSize: 13,
                lineNumbersMinChars: 4,
                padding: { top: 16, bottom: 16 },
                minimap: { enabled: true },
                folding: true,
              }}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('group relative overflow-hidden', bordered && 'rounded-lg border border-input')}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {expandable && (
        <button
          onClick={() => setFullscreen(true)}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-[oklch(0.2_0_0)] text-white/40 opacity-0 transition-opacity hover:bg-[oklch(0.25_0_0)] hover:text-white/80 group-hover:opacity-100"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      )}
      <Suspense
        fallback={
          <div style={{ height }} className="flex items-center justify-center bg-[oklch(0.12_0_0)] text-xs text-white/30">
            Loading editor...
          </div>
        }
      >
        <MonacoEditor
          height={height}
          language={language}
          value={value}
          onChange={(v) => onChangeRef.current(v ?? '')}
          theme="vs-dark"
          beforeMount={injectTypes}
          options={editorOptions}
        />
      </Suspense>
    </div>
  )
}
