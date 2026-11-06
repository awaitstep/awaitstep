import { lazy, Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { debounce } from '../../lib/debounce'
import { configureMonaco } from '../../lib/monaco/setup'
import { BASE_EDITOR_OPTIONS, FULLSCREEN_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { useMonacoTheme } from '../../lib/monaco/theme'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  height?: string
  bordered?: boolean
  expandable?: boolean
  title?: string
  debounceMs?: number
  /** Stable model URI (see workflowModelPath) so panes share one model. */
  path?: string
  /** Shows the code without accepting edits (a read-only version). */
  readOnly?: boolean
}

const editorOptions = { ...BASE_EDITOR_OPTIONS, padding: { top: 6, bottom: 6 } }

export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  height = '200px',
  bordered = true,
  expandable = true,
  title,
  debounceMs,
  path,
  readOnly = false,
}: CodeEditorProps) {
  const monacoTheme = useMonacoTheme()
  const [mounted, setMounted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const pendingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const debouncedOnChange = useMemo(
    () =>
      debounceMs
        ? debounce((v: string) => {
            pendingRef.current = false
            onChangeRef.current(v)
          }, debounceMs)
        : null,
    [debounceMs],
  )

  useEffect(() => {
    if (!pendingRef.current) setLocalValue(value)
  }, [value])

  // A pending edit is written, not dropped, when the editor goes away or loses focus.
  useEffect(() => () => debouncedOnChange?.flush(), [debouncedOnChange])

  const handleMount = useCallback(
    (editor: { onDidBlurEditorText: (listener: () => void) => unknown }) => {
      editor.onDidBlurEditorText(() => debouncedOnChange?.flush())
    },
    [debouncedOnChange],
  )

  const handleChange = useCallback(
    (v: string) => {
      if (debouncedOnChange) {
        setLocalValue(v)
        pendingRef.current = true
        debouncedOnChange(v)
      } else {
        onChangeRef.current(v)
      }
    },
    [debouncedOnChange],
  )

  const displayValue = debouncedOnChange ? localValue : value

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
      <div
        style={{ height }}
        className={cn(
          'flex items-center justify-center overflow-hidden bg-editor text-xs text-muted-foreground/60',
          bordered && 'rounded-lg border border-input',
        )}
      >
        Loading editor...
      </div>
    )
  }

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <span className="text-xs font-medium text-foreground/60">{title ?? 'Code Editor'}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground/40">ESC to close</span>
            <button
              onClick={() => setFullscreen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
              value={displayValue}
              path={path}
              onChange={(v) => handleChange(v ?? '')}
              onMount={handleMount}
              theme={monacoTheme}
              beforeMount={configureMonaco}
              options={{ ...FULLSCREEN_EDITOR_OPTIONS, readOnly }}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div
      // A definite height lets a percentage (`height="100%"` to fill a pane) resolve.
      style={{ height }}
      className={cn('group relative overflow-hidden', bordered && 'rounded-lg border border-input')}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {expandable && (
        <button
          onClick={() => setFullscreen(true)}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      )}
      <Suspense
        fallback={
          <div
            style={{ height }}
            className="flex items-center justify-center bg-editor text-xs text-muted-foreground/60"
          >
            Loading editor...
          </div>
        }
      >
        <MonacoEditor
          height={height}
          language={language}
          value={displayValue}
          path={path}
          onChange={(v) => handleChange(v ?? '')}
          onMount={handleMount}
          theme={monacoTheme}
          beforeMount={configureMonaco}
          options={{ ...editorOptions, readOnly }}
        />
      </Suspense>
    </div>
  )
}
