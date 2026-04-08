import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Database,
  HardDrive,
  Archive,
  Radio,
  Brain,
  Search,
  BarChart3,
  Zap,
  Globe,
  Link,
} from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import {
  detectBindingsFromNodes,
  type ClientBinding,
  type ClientBindingType,
} from '../../lib/detect-bindings-client'
import { cn } from '../../lib/utils'

const BINDING_META: Record<ClientBindingType, { label: string; icon: typeof Database }> = {
  kv: { label: 'KV', icon: HardDrive },
  d1: { label: 'D1', icon: Database },
  r2: { label: 'R2', icon: Archive },
  queue: { label: 'Queue', icon: Radio },
  ai: { label: 'AI', icon: Brain },
  vectorize: { label: 'Vectorize', icon: Search },
  analytics_engine: { label: 'Analytics', icon: BarChart3 },
  hyperdrive: { label: 'Hyperdrive', icon: Zap },
  browser: { label: 'Browser', icon: Globe },
  service: { label: 'Service', icon: Link },
}

export function BindingsPanel() {
  const [expanded, setExpanded] = useState(false)
  const nodes = useWorkflowStore((s) => s.nodes)

  const bindings: ClientBinding[] = useMemo(() => {
    if (nodes.length === 0) return []
    return detectBindingsFromNodes(nodes as Parameters<typeof detectBindingsFromNodes>[0])
  }, [nodes])

  if (bindings.length === 0) return null

  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="rounded-lg border border-border bg-card/95 shadow-md backdrop-blur-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/50"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          )}
          <span className="font-medium text-muted-foreground">Bindings</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            {bindings.length}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-border/50 px-3 py-2 space-y-1">
            {bindings.map((binding) => {
              const meta = BINDING_META[binding.type]
              const Icon = meta.icon
              return (
                <div
                  key={`${binding.type}:${binding.name}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 font-medium',
                      'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="font-mono text-foreground/70">{binding.name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
