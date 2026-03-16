import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, Key } from 'lucide-react'

interface KVBrowserProps {
  connectionId: string
}

export function KVBrowser({ connectionId }: KVBrowserProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data: namespaces, isLoading: nsLoading } = useQuery({
    queryKey: ['kv-namespaces', connectionId],
    queryFn: () =>
      fetch(`/api/resources/kv/namespaces?connectionId=${connectionId}`, { credentials: 'include' })
        .then((r) => r.json()),
    enabled: !!connectionId,
  })

  const { data: keysResult, isLoading: keysLoading } = useQuery({
    queryKey: ['kv-keys', connectionId, selectedNamespace, prefix],
    queryFn: () => {
      const params = new URLSearchParams({ connectionId })
      if (prefix) params.set('prefix', prefix)
      return fetch(`/api/resources/kv/namespaces/${selectedNamespace}/keys?${params}`, { credentials: 'include' })
        .then((r) => r.json())
    },
    enabled: !!selectedNamespace,
  })

  const { data: valueResult } = useQuery({
    queryKey: ['kv-value', connectionId, selectedNamespace, selectedKey],
    queryFn: () =>
      fetch(`/api/resources/kv/namespaces/${selectedNamespace}/values/${encodeURIComponent(selectedKey!)}?connectionId=${connectionId}`, { credentials: 'include' })
        .then((r) => r.json()),
    enabled: !!selectedNamespace && !!selectedKey,
  })

  return (
    <div className="flex h-full gap-4">
      {/* Namespace list */}
      <div className="w-56 shrink-0 space-y-1">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Namespaces</h3>
        {nsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {namespaces?.map((ns: { id: string; title: string }) => (
          <button
            key={ns.id}
            onClick={() => { setSelectedNamespace(ns.id); setSelectedKey(null) }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              selectedNamespace === ns.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            {ns.title}
          </button>
        ))}
      </div>

      {/* Key list + value */}
      <div className="flex-1 space-y-3">
        {selectedNamespace && (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="Filter by prefix..."
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {keysLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            <div className="space-y-0.5">
              {keysResult?.keys?.map((key: { name: string }) => (
                <button
                  key={key.name}
                  onClick={() => setSelectedKey(key.name)}
                  className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm font-mono transition-colors ${
                    selectedKey === key.name ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{key.name}</span>
                </button>
              ))}
            </div>

            {selectedKey && valueResult && (
              <div className="mt-4 space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Value</h4>
                <pre className="overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono">
                  {valueResult.value}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
