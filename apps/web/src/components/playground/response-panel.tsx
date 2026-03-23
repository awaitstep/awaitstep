import { lazy, Suspense, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StatusBadge } from './playground-badges'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

const readOnlyEditorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 11,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'none' as const,
  scrollbar: { vertical: 'hidden' as const, horizontal: 'hidden' as const, verticalScrollbarSize: 0, horizontalScrollbarSize: 0 },
  lineNumbersMinChars: 3,
  folding: true,
  glyphMargin: false,
  domReadOnly: true,
  contextmenu: false,
}

export interface ResponseData {
  status: number
  statusText: string
  body: string
  time: number
  headers: [string, string][]
}

export function ResponsePanel({ response }: { response: ResponseData }) {
  const [headersExpanded, setHeadersExpanded] = useState(false)

  const headersText = response.headers.map(([k, v]) => `${k}: ${v}`).join('\n')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={response.status} />
        <span className="text-xs text-muted-foreground">{response.statusText}</span>
        <span className="text-[11px] text-muted-foreground/60">{response.time}ms</span>
      </div>

      {/* Headers */}
      <div className="shrink-0 overflow-hidden rounded-md border border-border">
        <button
          onClick={() => setHeadersExpanded((v) => !v)}
          className="flex w-full items-center gap-1 border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {headersExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Response Headers ({response.headers.length})
        </button>
        {headersExpanded && (
          <Suspense fallback={<div className="p-3 text-xs text-muted-foreground/60">Loading...</div>}>
            <MonacoEditor
              height={`${Math.min(response.headers.length * 18 + 16, 150)}px`}
              language="plaintext"
              value={headersText}
              theme="vs-dark"
              options={readOnlyEditorOptions}
            />
          </Suspense>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="flex shrink-0 items-center border-b border-border bg-muted/30 px-3 py-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Response Body</span>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground/60">Loading editor...</div>}>
            <MonacoEditor
              height="100%"
              language="json"
              value={response.body}
              theme="vs-dark"
              options={readOnlyEditorOptions}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
