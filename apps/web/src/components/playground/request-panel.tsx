import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { getOrigin } from '../../lib/utils'
import { Button } from '../ui/button'
import { CodeEditor } from '../ui/code-editor'
import { MethodBadge, ScopeBadge } from './playground-badges'
import type { EndpointDef } from '../../lib/playground-endpoints'
import type { ResponseData } from './response-panel'

export function RequestPanel({
  endpoint,
  apiKey,
  onResponse,
  onLoadingChange,
}: {
  endpoint: EndpointDef
  apiKey: string
  onResponse: (response: ResponseData) => void
  onLoadingChange: (loading: boolean) => void
}) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState(endpoint.bodyExample ?? '')
  const [loading, setLoading] = useState(false)

  function resolvedPath(): string {
    let p = endpoint.path
    for (const param of endpoint.params) {
      if (param.in === 'path') {
        p = p.replace(`:${param.name}`, paramValues[param.name] || `:${param.name}`)
      }
    }
    const queryParams = endpoint.params
      .filter((param) => param.in === 'query' && paramValues[param.name])
      .map(
        (param) =>
          `${encodeURIComponent(param.name)}=${encodeURIComponent(paramValues[param.name])}`,
      )
    if (queryParams.length > 0) {
      p += `?${queryParams.join('&')}`
    }
    return p
  }

  function canSend(): boolean {
    if (!apiKey || loading) return false
    return endpoint.params.filter((p) => p.required).every((p) => paramValues[p.name]?.trim())
  }

  async function sendRequest() {
    if (!canSend()) return
    setLoading(true)
    onLoadingChange(true)

    const url = resolvedPath()
    const apiBase = getOrigin()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    }
    if (endpoint.hasBody) {
      headers['Content-Type'] = 'application/json'
    }

    const start = performance.now()
    try {
      const res = await fetch(`${apiBase}${url}`, {
        method: endpoint.method,
        headers,
        body: endpoint.hasBody && body ? body : undefined,
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

      onResponse({
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
      onLoadingChange(false)
    }
  }

  return (
    <div className="shrink-0 space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <MethodBadge method={endpoint.method} />
        <code className="min-w-0 truncate text-xs text-foreground">{resolvedPath()}</code>
        <div className="ml-auto flex items-center gap-2">
          <ScopeBadge scope={endpoint.scope} />
          <Button
            size="sm"
            onClick={sendRequest}
            disabled={!canSend()}
            className="h-7 gap-1.5 px-3 text-xs"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send
          </Button>
        </div>
      </div>

      {endpoint.params.length > 0 && (
        <div className="rounded-md border border-border">
          {endpoint.params.map((param, i) => (
            <div
              key={param.name}
              className={`flex items-center gap-3 px-3 py-1.5 ${i < endpoint.params.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex w-32 shrink-0 items-center gap-1.5">
                <span
                  className={`rounded px-1 py-0.5 text-xs font-medium ${param.in === 'path' ? 'bg-status-warning/10 text-status-warning' : 'bg-status-info/10 text-status-info'}`}
                >
                  {param.in}
                </span>
                <span className="font-mono text-xs text-foreground">
                  {param.name}
                  {param.required && <span className="text-status-error">*</span>}
                </span>
              </div>
              <input
                placeholder={`Enter ${param.name}`}
                value={paramValues[param.name] ?? ''}
                onChange={(e) =>
                  setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                }
                className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      )}

      {endpoint.hasBody && (
        <CodeEditor
          value={body}
          onChange={setBody}
          language="json"
          height="120px"
          expandable={false}
        />
      )}
    </div>
  )
}
