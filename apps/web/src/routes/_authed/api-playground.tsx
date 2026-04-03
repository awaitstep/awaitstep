import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { EndpointDef } from '../../lib/playground-endpoints'
import { EndpointSidebar } from '../../components/playground/endpoint-sidebar'
import { RequestPanel } from '../../components/playground/request-panel'
import { ResponsePanel, type ResponseData } from '../../components/playground/response-panel'

export const Route = createFileRoute('/_authed/api-playground')({
  head: () => ({ meta: [{ title: 'API Playground | AwaitStep' }] }),
  component: ApiPlaygroundPage,
})

function ApiPlaygroundPage() {
  const [apiKey, setApiKey] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef | null>(null)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)

  function selectEndpoint(endpoint: EndpointDef) {
    setSelectedEndpoint(endpoint)
    setResponse(null)
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      {/* Header row: title + key */}
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">API Playground</h1>
        <div className="relative">
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

      {/* Main content: sidebar + panel */}
      <div className="flex min-h-0 flex-1 gap-4">
        <EndpointSidebar
          selectedEndpointId={selectedEndpoint?.id}
          onSelectEndpoint={selectEndpoint}
        />

        {/* Right: request builder + response */}
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
