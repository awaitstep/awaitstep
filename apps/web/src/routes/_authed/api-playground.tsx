import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Search, Loader2, Send, KeyRound } from 'lucide-react'
import { endpoints, endpointGroups, type EndpointDef } from '../../lib/playground-endpoints'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { CodeEditor } from '../../components/ui/code-editor'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

export const Route = createFileRoute('/_authed/api-playground')({
  component: ApiPlaygroundPage,
})

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PATCH: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
}

const SCOPE_COLORS: Record<string, string> = {
  read: 'bg-emerald-500/15 text-emerald-400',
  write: 'bg-blue-500/15 text-blue-400',
  deploy: 'bg-purple-500/15 text-purple-400',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold ${METHOD_COLORS[method] ?? ''}`}>
      {method}
    </span>
  )
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${SCOPE_COLORS[scope] ?? ''}`}>
      {scope}
    </span>
  )
}

function StatusBadge({ status }: { status: number }) {
  const color = status < 300 ? 'bg-emerald-500/15 text-emerald-400' : status < 500 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${color}`}>{status}</span>
}

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

interface ResponseData {
  status: number
  statusText: string
  body: string
  time: number
  headers: [string, string][]
}

function ApiPlaygroundPage() {
  const [apiKey, setApiKey] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(endpointGroups))
  const [headersExpanded, setHeadersExpanded] = useState(false)

  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return endpoints
    const q = searchQuery.toLowerCase()
    return endpoints.filter((e) => e.path.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
  }, [searchQuery])

  const filteredGroups = useMemo(() => {
    return endpointGroups.filter((g) => filteredEndpoints.some((e) => e.group === g))
  }, [filteredEndpoints])

  function selectEndpoint(endpoint: EndpointDef) {
    setSelectedEndpoint(endpoint)
    setParamValues({})
    setBody(endpoint.bodyExample ?? '')
    setResponse(null)
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function resolvedPath(): string {
    if (!selectedEndpoint) return ''
    let p = selectedEndpoint.path
    for (const param of selectedEndpoint.params) {
      if (param.in === 'path') {
        p = p.replace(`:${param.name}`, paramValues[param.name] || `:${param.name}`)
      }
    }
    const queryParams = selectedEndpoint.params
      .filter((param) => param.in === 'query' && paramValues[param.name])
      .map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(paramValues[param.name])}`)
    if (queryParams.length > 0) {
      p += `?${queryParams.join('&')}`
    }
    return p
  }

  function canSend(): boolean {
    if (!apiKey || !selectedEndpoint || loading) return false
    return selectedEndpoint.params.filter((p) => p.required).every((p) => paramValues[p.name]?.trim())
  }

  async function sendRequest() {
    if (!selectedEndpoint || !canSend()) return
    setLoading(true)
    setResponse(null)

    const url = resolvedPath()
    const apiBase = window.location.origin
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    }
    if (selectedEndpoint.hasBody) {
      headers['Content-Type'] = 'application/json'
    }

    const start = performance.now()
    try {
      const res = await fetch(`${apiBase}${url}`, {
        method: selectedEndpoint.method,
        headers,
        body: selectedEndpoint.hasBody && body ? body : undefined,
      })
      const elapsed = performance.now() - start

      let responseBody: string
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('json')) {
        const json = await res.json()
        responseBody = JSON.stringify(json, null, 2)
      } else {
        responseBody = await res.text()
      }

      const responseHeaders: [string, string][] = []
      res.headers.forEach((value, key) => {
        responseHeaders.push([key, value])
      })

      setResponse({
        status: res.status,
        statusText: res.statusText,
        body: responseBody,
        time: Math.round(elapsed),
        headers: responseHeaders,
      })
    } catch (err) {
      toast.error(`Network error: ${err instanceof Error ? err.message : 'Request failed'}`)
    } finally {
      setLoading(false)
    }
  }

  const headersText = response
    ? response.headers.map(([k, v]) => `${k}: ${v}`).join('\n')
    : ''

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      {/* Header row: title + key */}
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">API Playground</h1>
        <div className="relative">
          <KeyRound size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            placeholder="Paste API key (ask_...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-8 w-64 rounded-md border border-border bg-card pl-8 pr-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Main content: sidebar + panel */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: endpoint list */}
        <div className="flex w-72 shrink-0 flex-col gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border scrollbar-none">
            {filteredGroups.map((group) => (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
                >
                  {expandedGroups.has(group) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {group}
                </button>
                {expandedGroups.has(group) &&
                  filteredEndpoints
                    .filter((e) => e.group === group)
                    .map((endpoint) => (
                      <button
                        key={endpoint.id}
                        onClick={() => selectEndpoint(endpoint)}
                        className={`flex w-full items-center gap-1.5 border-b border-border px-3 py-1.5 text-left transition-colors hover:bg-muted/40 ${
                          selectedEndpoint?.id === endpoint.id ? 'bg-muted/60' : ''
                        }`}
                      >
                        <MethodBadge method={endpoint.method} />
                        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{endpoint.path.replace('/api', '')}</span>
                      </button>
                    ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right: request builder + response */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {selectedEndpoint ? (
            <>
              {/* Request section */}
              <div className="shrink-0 space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <MethodBadge method={selectedEndpoint.method} />
                  <code className="min-w-0 truncate text-xs text-foreground">{resolvedPath()}</code>
                  <div className="ml-auto flex items-center gap-2">
                    <ScopeBadge scope={selectedEndpoint.scope} />
                    <Button size="sm" onClick={sendRequest} disabled={!canSend()} className="h-7 gap-1.5 px-3 text-xs">
                      {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Send
                    </Button>
                  </div>
                </div>

                {selectedEndpoint.params.length > 0 && (
                  <div className="rounded-md border border-border">
                    {selectedEndpoint.params.map((param, i) => (
                      <div
                        key={param.name}
                        className={`flex items-center gap-3 px-3 py-1.5 ${i < selectedEndpoint.params.length - 1 ? 'border-b border-border' : ''}`}
                      >
                        <div className="flex w-32 shrink-0 items-center gap-1.5">
                          <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${param.in === 'path' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {param.in}
                          </span>
                          <span className="font-mono text-[11px] text-foreground">
                            {param.name}
                            {param.required && <span className="text-red-400">*</span>}
                          </span>
                        </div>
                        <input
                          placeholder={`Enter ${param.name}`}
                          value={paramValues[param.name] ?? ''}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
                          className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selectedEndpoint.hasBody && (
                  <CodeEditor value={body} onChange={setBody} language="json" height="120px" expandable={false} />
                )}
              </div>

              {/* Response section */}
              {response ? (
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
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground/50">
                  Send a request to see the response
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground/50">
              Select an endpoint from the list
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
