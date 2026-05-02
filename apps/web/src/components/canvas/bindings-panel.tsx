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
  Plus,
} from 'lucide-react'
import { deriveQueueName } from '@awaitstep/provider-cloudflare/codegen'
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

/**
 * Returns true if the trigger code already declares a `@queue function NAME(...)`
 * for the given queue name. Plain regex — assumes annotations live at top
 * level (matches our parser's contract).
 */
function hasQueueHandler(triggerCode: string, queueName: string): boolean {
  const re = new RegExp(`@queue\\s+function\\s+${queueName}\\s*\\(`)
  return re.test(triggerCode)
}

function buildConsumeSnippet(queueName: string): string {
  return `

@queue function ${queueName}(batch, env, ctx) {
  for (const msg of batch.messages) {
    // process msg.body
    msg.ack()
  }
}`
}

export function BindingsPanel() {
  const [expanded, setExpanded] = useState(false)
  const nodes = useWorkflowStore((s) => s.nodes)
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const setTriggerCode = useWorkflowStore((s) => s.setTriggerCode)
  const setShowEditor = useWorkflowStore((s) => s.setShowEditor)

  const bindings: ClientBinding[] = useMemo(() => {
    if (nodes.length === 0) return []
    return detectBindingsFromNodes(nodes as Parameters<typeof detectBindingsFromNodes>[0])
  }, [nodes])

  if (bindings.length === 0) return null

  const handleConsumeClick = (bindingName: string) => {
    const queueName = deriveQueueName(bindingName)
    if (!hasQueueHandler(triggerCode, queueName)) {
      setTriggerCode(triggerCode + buildConsumeSnippet(queueName))
    }
    // Open the code editor so the user sees the inserted handler in context.
    setShowEditor(true)
  }

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
              const isQueue = binding.type === 'queue'
              const queueName = isQueue ? deriveQueueName(binding.name) : null
              const alreadyConsumed =
                isQueue && queueName !== null && hasQueueHandler(triggerCode, queueName)
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
                  {isQueue &&
                    (alreadyConsumed ? (
                      <span className="text-muted-foreground/60 text-xs italic">consumed</span>
                    ) : (
                      <button
                        onClick={() => handleConsumeClick(binding.name)}
                        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                        title={`Add @queue function ${queueName}(...) to trigger code`}
                      >
                        <Plus className="h-3 w-3" />
                        Consume
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
