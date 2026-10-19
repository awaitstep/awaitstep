import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
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
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { deriveQueueName } from '@awaitstep/provider-cloudflare/codegen'
import { useWorkflowStore } from '../../stores/workflow-store'
import { ApiError, ProjectFileConflictError, api } from '../../lib/api-client'
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

/** The stored handlers.ts, or null when the project has none yet. */
async function fetchStoredHandlers(workflowId: string) {
  try {
    return await api.getProjectFile(workflowId, PROJECT_HANDLERS_PATH)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function BindingsPanel() {
  const [expanded, setExpanded] = useState(false)
  const nodes = useWorkflowStore((s) => s.nodes)
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const workflowId = useWorkflowStore((s) => s.workflowId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const canConsume = workflowId !== null && workflowId !== 'new'

  const bindings: ClientBinding[] = useMemo(() => {
    if (nodes.length === 0) return []
    return detectBindingsFromNodes(nodes as Parameters<typeof detectBindingsFromNodes>[0])
  }, [nodes])

  if (bindings.length === 0) return null

  // Handlers are project code (handlers.ts), so the consumer is appended to
  // the stored file — created from the legacy trigger code when there is
  // none — under the same preconditions the code workspace uses, and the
  // canvas keeps a mirror for the "consumed" marker.
  async function handleConsumeClick(bindingName: string) {
    if (!canConsume) return
    const queueName = deriveQueueName(bindingName)
    try {
      const stored = await fetchStoredHandlers(workflowId)
      const base = stored?.source ?? triggerCode
      const next = hasQueueHandler(base, queueName) ? base : base + buildConsumeSnippet(queueName)
      if (next !== stored?.source) {
        await api.putProjectFile(
          workflowId,
          PROJECT_HANDLERS_PATH,
          next,
          stored ? { ifMatch: stored.hash } : { ifNoneMatch: true },
        )
      }
      // Mirror without marking the canvas dirty — the file is already saved.
      useWorkflowStore.setState({ triggerCode: next })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] }),
      ])
      toast.success(`Consumer for ${queueName} added to ${PROJECT_HANDLERS_PATH}`, {
        action: {
          label: 'Open in Code',
          onClick: () => {
            void navigate({
              to: '/workflows/$workflowId/code',
              params: { workflowId },
              search: { file: PROJECT_HANDLERS_PATH },
            })
          },
        },
      })
    } catch (err) {
      if (err instanceof ProjectFileConflictError) {
        toast.error(`${PROJECT_HANDLERS_PATH} changed while adding the consumer`, {
          description: 'Open Code to add it there with the latest handlers in view.',
        })
        return
      }
      toast.error(err instanceof Error ? err.message : `Could not update ${PROJECT_HANDLERS_PATH}`)
    }
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
                        disabled={!canConsume}
                        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          canConsume
                            ? `Add @queue function ${queueName}(...) to ${PROJECT_HANDLERS_PATH}`
                            : 'Save the workflow first'
                        }
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
