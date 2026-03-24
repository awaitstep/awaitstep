import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { endpoints, endpointGroups, type EndpointDef } from '../../lib/playground-endpoints'
import { Input } from '../ui/input'
import { MethodBadge } from './playground-badges'

export function EndpointSidebar({
  selectedEndpointId,
  onSelectEndpoint,
}: {
  selectedEndpointId: string | undefined
  onSelectEndpoint: (endpoint: EndpointDef) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(endpointGroups))

  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return endpoints
    const q = searchQuery.toLowerCase()
    return endpoints.filter(
      (e) => e.path.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const filteredGroups = useMemo(() => {
    return endpointGroups.filter((g) => filteredEndpoints.some((e) => e.group === g))
  }, [filteredEndpoints])

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
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
                    onClick={() => onSelectEndpoint(endpoint)}
                    className={`flex w-full items-center gap-1.5 border-b border-border px-3 py-1.5 text-left transition-colors hover:bg-muted/40 ${
                      selectedEndpointId === endpoint.id ? 'bg-muted/60' : ''
                    }`}
                  >
                    <MethodBadge method={endpoint.method} />
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                      {endpoint.path.replace('/api', '')}
                    </span>
                  </button>
                ))}
          </div>
        ))}
      </div>
    </div>
  )
}
