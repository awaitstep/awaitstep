import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { HANDLER_QUEUE_DIR, PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import {
  deriveQueueName,
  handlerModuleScaffold,
  toCFQueueName,
} from '@awaitstep/provider-cloudflare/codegen'
import { useWorkflowStore } from '../../stores/workflow-store'
import {
  ApiError,
  ProjectFileConflictError,
  api,
  describeHandlerDeclarations,
} from '../../lib/api-client'
import { queries } from '../../lib/queries'
import {
  detectBindingsFromNodes,
  type ClientBinding,
  type ClientBindingType,
} from '../../lib/detect-bindings-client'
import { cn } from '../../lib/utils'
import { useSwitchView } from '../../hooks/use-switch-view'

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
 * The queue a binding produces to, as Cloudflare names it: the same
 * normalisation the generated producer binding and the annotation parser
 * apply, so a consumer module's file name matches.
 */
function queueOf(binding: ClientBinding): string {
  return toCFQueueName(deriveQueueName(binding.name))
}

/**
 * Returns true if the trigger code already declares a `@queue function` whose
 * normalised name is `queue`. Plain regex — assumes annotations live at top
 * level (matches our parser's contract).
 */
function hasQueueHandler(triggerCode: string, queue: string): boolean {
  for (const match of triggerCode.matchAll(/@queue\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (toCFQueueName(match[1]!) === queue) return true
  }
  return false
}

function buildConsumeSnippet(queue: string): string {
  return `

@queue function ${queue.replace(/-/g, '_')}(batch, env, ctx) {
  for (const msg of batch.messages) {
    // process msg.body
    msg.ack()
  }
}`
}

/** The stored annotation file, or null when the project has none. */
async function fetchStoredHandlers(workflowId: string) {
  try {
    return await api.getProjectFile(workflowId, PROJECT_HANDLERS_PATH)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/** Converts the workflow's legacy trigger code, or null when it has none. */
async function convertIfLegacy(workflowId: string) {
  try {
    return await api.convertHandlers(workflowId)
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
  const switchView = useSwitchView(workflowId ?? 'new')
  const canConsume = workflowId !== null && workflowId !== 'new'
  const { data: full } = useQuery({
    ...queries.workflows.full(canConsume ? workflowId : ''),
    enabled: canConsume,
  })
  const consumedQueues = full?.handlers.consumedQueues ?? []

  const bindings: ClientBinding[] = useMemo(() => {
    if (nodes.length === 0) return []
    return detectBindingsFromNodes(nodes as Parameters<typeof detectBindingsFromNodes>[0])
  }, [nodes])

  if (bindings.length === 0) return null

  // A consumer is a handler module (handlers/queue/<name>.ts) — the file
  // is the declaration. A project still on the annotation model (a stored
  // handlers.ts or the legacy trigger-code setting) is converted first, so
  // its custom fetch handler and schedules survive; appending to the
  // annotation file is only kept for the stored-file case. The canvas does
  // not edit trigger code, so the server's copy is the whole truth and the
  // refetch below re-hydrates the mirror.
  async function handleConsumeClick(binding: ClientBinding) {
    if (!canConsume) return
    const queue = queueOf(binding)
    const notices: string[] = []
    try {
      const stored = await fetchStoredHandlers(workflowId)
      let created: string
      if (stored) {
        const next = hasQueueHandler(stored.source, queue)
          ? stored.source
          : stored.source + buildConsumeSnippet(queue)
        if (next !== stored.source) {
          await api.putProjectFile(workflowId, PROJECT_HANDLERS_PATH, next, {
            ifMatch: stored.hash,
          })
        }
        created = PROJECT_HANDLERS_PATH
      } else {
        // Trigger code can live in the setting or inside the current
        // version's IR; the server knows which, and says 404 when there is
        // nothing to convert.
        const conversion = full?.handlers.modules ? null : await convertIfLegacy(workflowId)
        if (conversion) {
          notices.push('Trigger code converted to handler modules.')
          if (!conversion.deploymentConfigUpdated) {
            const facts = describeHandlerDeclarations(conversion.declarations)
            if (facts.length > 0) {
              notices.push(
                `Declare in the deployment config before deploying: ${facts.join('; ')}.`,
              )
            }
          }
        }
        created = `${HANDLER_QUEUE_DIR}${queue}.ts`
        await api.putProjectFile(
          workflowId,
          created,
          handlerModuleScaffold({ kind: 'queue', queue }),
          { ifNoneMatch: true },
        )
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] }),
      ])
      toast.success(`Consumer for ${queue} added in ${created}`, {
        ...(notices.length > 0 && { description: notices.join(' '), duration: 15_000 }),
        action: {
          label: 'Open in Code',
          onClick: () => {
            void switchView('ide', { file: created })
          },
        },
      })
    } catch (err) {
      // A conversion that already succeeded stands even though the consumer
      // did not: say so, and let the refetch show the new modules.
      if (notices.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] }),
          queryClient.invalidateQueries({ queryKey: ['workflow-source', workflowId] }),
          queryClient.invalidateQueries({ queryKey: ['deploy-config', workflowId] }),
        ])
      }
      const detail =
        err instanceof ProjectFileConflictError
          ? `The consumer for ${queue} changed while it was being added. Open Code to see the latest handlers.`
          : err instanceof Error
            ? err.message
            : 'Could not add the consumer'
      toast.error(`Could not add the consumer for ${queue}`, {
        description: [...notices, detail].join(' '),
        ...(notices.length > 0 && { duration: 15_000 }),
      })
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
              const queue = isQueue ? queueOf(binding) : null
              const alreadyConsumed =
                queue !== null &&
                (consumedQueues.includes(queue) || hasQueueHandler(triggerCode, queue))
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
                        onClick={() => handleConsumeClick(binding)}
                        disabled={!canConsume}
                        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          canConsume
                            ? `Create ${HANDLER_QUEUE_DIR}${queue}.ts`
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
