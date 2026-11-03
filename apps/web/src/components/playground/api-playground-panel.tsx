import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { EndpointDef } from '../../lib/playground-endpoints'
import { EndpointSidebar } from './endpoint-sidebar'
import { RequestPanel } from './request-panel'
import { ResponsePanel, type ResponseData } from './response-panel'

/**
 * The API Playground's two panes — the endpoint list and the request/response
 * builder — filling the dashboard's main column below the top bar. The key box
 * rides at the top of the panel (not the top bar, which hides on phones).
 */
export function ApiPlaygroundPanel() {
  const [apiKey, setApiKey] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef | null>(null)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)

  function selectEndpoint(endpoint: EndpointDef) {
    setSelectedEndpoint(endpoint)
    setResponse(null)
  }

  return (
    // Fill the main column exactly: full viewport height minus the chrome, so the
    // panes scroll, not the page. On md that's the top bar (h-16); below md it's the
    // mobile header (h-14) plus the fixed bottom tab bar (h-14) — 7rem together.
    <div className="flex h-[calc(100svh-7rem)] flex-col gap-4 px-6 py-4 md:h-[calc(100svh-4rem)] md:px-8">
      <div className="flex shrink-0 items-center gap-3">
        {/* The top bar names the page on md; below md it's hidden, so the panel says it. */}
        <h1 className="text-lg font-semibold tracking-tight md:hidden">API Playground</h1>
        <div className="relative ml-auto">
          <KeyRound
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="password"
            placeholder="Paste API key (ask_...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-8 w-64 rounded-md border border-border bg-card pl-8 pr-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <EndpointSidebar
          selectedEndpointId={selectedEndpoint?.id}
          onSelectEndpoint={selectEndpoint}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {selectedEndpoint ? (
            <>
              <RequestPanel
                key={selectedEndpoint.id}
                endpoint={selectedEndpoint}
                apiKey={apiKey}
                onResponse={setResponse}
                onLoadingChange={setLoading}
              />

              {response ? (
                <ResponsePanel response={response} />
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground/50">
                  {loading ? 'Sending request...' : 'Send a request to see the response'}
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
