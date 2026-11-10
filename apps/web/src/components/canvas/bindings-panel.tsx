import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { actionToast, LONG_TOAST_MS, failureLine } from '../../lib/action-toast'
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
import { handlerModuleScaffold } from '@awaitstep/codegen'
import {
  deriveQueueName,
  extractCloudflareSource,
  toCFQueueName,
} from '@awaitstep/provider-cloudflare/codegen'
import { useWorkflowStore } from '../../stores/workflow-store'
import {
  ApiError,
  ProjectFileConflictError,
  describeHandlerDeclarations,
  type ApiClient,
} from '../../lib/api-client'
import {
  detectBindingsFromNodes,
  type ClientBinding,
  type ClientBindingType,
} from '@awaitstep/provider-cloudflare/codegen'
import { cn } from '../../lib/utils'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useApi, useQueries } from '../../contexts/api-client-context'
import { useProviderCapabilities } from '../../hooks/use-provider-capabilities'
import { AddBindingDialog } from './add-binding-dialog'
import { MapBindingDialog } from './map-binding-dialog'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

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
  workflow: { label: 'Workflow', icon: Link },
}

const PROVIDER_PROFILE_PATH = 'providers/cloudflare.ts'
const MAP_RESOURCE_LABELS: Partial<Record<ClientBindingType, string>> = {
  r2: 'Bucket name',
  queue: 'Queue name',
  vectorize: 'Index name',
  service: 'Service name',
  workflow: 'Workflow binding',
}

const CLIENT_BINDING_TYPES = new Set<ClientBindingType>(
  Object.keys(BINDING_META) as ClientBindingType[],
)

function isClientBindingType(value: string): value is ClientBindingType {
  return CLIENT_BINDING_TYPES.has(value as ClientBindingType)
}

const NAME_MAPPING_KINDS = new Set<ClientBindingType>(['r2', 'queue', 'service', 'vectorize'])
const MAPPING_KINDS = new Set<ClientBindingType>([
  'kv',
  'd1',
  'r2',
  'queue',
  'vectorize',
  'hyperdrive',
  'service',
])

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
async function fetchStoredHandlers(api: ApiClient, workflowId: string) {
  try {
    return await api.getProjectFile(workflowId, PROJECT_HANDLERS_PATH)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/** Converts the workflow's legacy trigger code, or null when it has none. */
async function convertIfLegacy(api: ApiClient, workflowId: string) {
  try {
    return await api.convertHandlers(workflowId)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function BindingsPanel() {
  const api = useApi()
  const capabilities = useProviderCapabilities()
  const supportsQueue = capabilities.some((capability) => capability.handlerKinds.includes('queue'))
  const providerLabel =
    capabilities.length === 1 ? capabilities[0]?.label : capabilities.map((c) => c.label).join(', ')
  const queries = useQueries()
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [mapTarget, setMapTarget] = useState<ClientBinding | null>(null)
  const nodes = useWorkflowStore((s) => s.nodes)
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const workflowId = useWorkflowStore((s) => s.workflowId)
  const runtimeResources = useWorkflowStore((s) => s.runtimeResources)
  const upsertRuntimeResource = useWorkflowStore((s) => s.upsertRuntimeResource)
  const queryClient = useQueryClient()
  const switchView = useSwitchView(workflowId ?? 'new')
  const saved = workflowId !== null && workflowId !== 'new'
  // Consuming writes project files: never on an older version or for a Viewer.
  const readOnly = useWorkflowStore((s) => s.readOnly)
  const canConsume = saved && !readOnly
  const { data: full } = useQuery({
    ...queries.workflows.full(saved ? workflowId : ''),
    enabled: saved,
  })
  const consumedQueues = full?.handlers.consumedQueues ?? []
  const { data: profileFile } = useQuery({
    queryKey: ['project-file', workflowId, PROVIDER_PROFILE_PATH],
    queryFn: () => api.getProjectFile(workflowId!, PROVIDER_PROFILE_PATH),
    enabled: saved,
    retry: false,
  })
  const { data: deployConnections } = useQuery({
    ...queries.connections.forDeploy(saved ? workflowId : ''),
    enabled: saved,
  })
  const availableConnections = deployConnections?.connections ?? []
  const connectionId =
    [
      deployConnections?.defaultId,
      ...(deployConnections?.deployedWith ?? []).map((c) => c.id),
    ].find((id) => id && availableConnections.some((connection) => connection.id === id)) ??
    availableConnections[0]?.id ??
    null
  const connectionName =
    deployConnections?.connections?.find((connection) => connection.id === connectionId)?.name ??
    'this connection'
  const { data: deployConfig } = useQuery({
    queryKey: ['deploy-config', workflowId, connectionId],
    queryFn: () => api.getDeployConfig(workflowId!, connectionId!),
    enabled: saved && connectionId !== null,
  })
  const mappings = (deployConfig?.config.bindings ?? {}) as Record<
    string,
    { resourceId?: string; resourceName?: string }
  >

  const supportedKinds = useMemo(
    () => new Set(capabilities.flatMap((capability) => capability.bindingKinds)),
    [capabilities],
  )
  const bindings = useMemo(() => {
    const rows = new Map<string, ClientBinding & { declared: boolean }>()
    if (nodes.length > 0 && supportedKinds.size > 0) {
      for (const binding of detectBindingsFromNodes(
        nodes as Parameters<typeof detectBindingsFromNodes>[0],
      )) {
        if (supportedKinds.has(binding.type)) {
          rows.set(`${binding.type}:${binding.name}`, { ...binding, declared: false })
        }
      }
    }
    for (const node of nodes) {
      const code = node.data.irNode?.data.code
      if (typeof code !== 'string') continue
      for (const binding of extractCloudflareSource(code).usage) {
        if (!supportedKinds.has(binding.kind)) continue
        rows.set(`${binding.kind}:${binding.name}`, {
          name: binding.name,
          type: binding.kind,
          declared: false,
        })
      }
    }
    if (triggerCode) {
      for (const binding of extractCloudflareSource(triggerCode).usage) {
        if (!supportedKinds.has(binding.kind)) continue
        rows.set(`${binding.kind}:${binding.name}`, {
          name: binding.name,
          type: binding.kind,
          declared: false,
        })
      }
    }
    if (profileFile?.source) {
      for (const binding of extractCloudflareSource(profileFile.source).profile?.bindings ?? []) {
        if (!supportedKinds.has(binding.kind)) continue
        rows.set(`${binding.kind}:${binding.name}`, {
          name: binding.name,
          type: binding.kind,
          declared: true,
        })
      }
    }
    for (const resource of runtimeResources) {
      if (!isClientBindingType(resource.kind)) continue
      rows.set(`${resource.kind}:${resource.name}`, {
        name: resource.name,
        type: resource.kind,
        declared: true,
      })
    }
    return [...rows.values()]
  }, [nodes, profileFile, runtimeResources, supportedKinds, triggerCode])

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
      const stored = await fetchStoredHandlers(api, workflowId)
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
        const conversion = full?.handlers.modules ? null : await convertIfLegacy(api, workflowId)
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
      actionToast.success(`Consumer for ${queue} added in ${created}`, {
        ...(notices.length > 0 && { description: notices.join(' ') }),
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
      const reason =
        err instanceof ProjectFileConflictError
          ? `The consumer for ${queue} changed while it was being added. Open Code to see the latest handlers.`
          : failureLine(err, `Couldn’t add the consumer for ${queue}`)
      // What the conversion already did rides as the description, with the
      // long time when there are notices to act on.
      actionToast.error(reason, {
        ...(notices.length > 0 && { description: notices.join(' '), duration: LONG_TOAST_MS }),
      })
    }
  }

  async function handleMapSave(resourceId: string) {
    if (!workflowId || !connectionId || !mapTarget) return
    const config = deployConfig?.config ?? {}
    const nextBindings = {
      ...(config.bindings as Record<string, unknown> | undefined),
      [mapTarget.name]: NAME_MAPPING_KINDS.has(mapTarget.type)
        ? { kind: mapTarget.type, resourceName: resourceId }
        : { kind: mapTarget.type, resourceId },
    }
    await api.putDeployConfig(workflowId, connectionId, { bindings: nextBindings })
    await queryClient.invalidateQueries({ queryKey: ['deploy-config', workflowId] })
    actionToast.success(`${mapTarget.name} mapped on ${connectionName}`)
  }

  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="rounded-lg border border-border bg-card/95 shadow-md backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
          <Button
            onClick={() => setExpanded(!expanded)}
            variant="ghost"
            size="sm"
            className="p-0 gap-2 hover:bg-transparent"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            )}
            <span className="font-medium text-muted-foreground">Bindings</span>
            <Badge variant="success" className="rounded-full">
              {bindings.length}
            </Badge>
          </Button>
          {providerLabel && (
            <Badge
              dot
              variant="warning"
              className="text-[10px] rounded"
              title={`These resources are supplied by ${providerLabel}`}
            >
              {providerLabel} only
            </Badge>
          )}
          <Button
            type="button"
            aria-label="Add binding"
            title={readOnly ? 'Read-only' : 'Add binding'}
            disabled={readOnly}
            onClick={() => setAddOpen(true)}
            size="icon"
            variant="secondary"
            className="size-5 ml-auto"
          >
            <Plus className="size-2" />
          </Button>
        </div>

        {expanded && (
          <div className="border-t border-border/50 px-3 py-2 space-y-1">
            {bindings.length === 0 && (
              <p className="text-xs text-muted-foreground">No bindings declared yet.</p>
            )}
            {bindings.map((binding) => {
              const meta = BINDING_META[binding.type]
              const label =
                capabilities.find((capability) => capability.bindingKinds.includes(binding.type))
                  ?.bindingKindLabels[binding.type] ?? meta.label
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
                    {label}
                  </span>
                  <span className="font-mono text-foreground/70">{binding.name}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {binding.declared ? 'Declared' : 'Detected'}
                  </span>
                  {MAPPING_KINDS.has(binding.type) ? (
                    connectionId ? (
                      mappings[binding.name]?.resourceId || mappings[binding.name]?.resourceName ? (
                        <button
                          type="button"
                          onClick={() => setMapTarget(binding)}
                          disabled={readOnly}
                          className="rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mapped
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMapTarget(binding)}
                          disabled={readOnly}
                          className="rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Map
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60">
                        Map when you deploy
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">No mapping needed</span>
                  )}
                  {isQueue &&
                    supportsQueue &&
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
                            : readOnly
                              ? 'Read-only'
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
            <p className="pt-1 text-[10px] text-muted-foreground/60">
              Map resources when you deploy. Local test uses local emulation and needs no account.
            </p>
          </div>
        )}
      </div>
      <AddBindingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingNames={bindings.map((binding) => binding.name)}
        onAdd={(resource) => upsertRuntimeResource(resource)}
      />
      {mapTarget && (
        <MapBindingDialog
          key={`${mapTarget.name}:${mappings[mapTarget.name]?.resourceId ?? mappings[mapTarget.name]?.resourceName ?? ''}`}
          open
          onOpenChange={(open) => {
            if (!open) setMapTarget(null)
          }}
          bindingName={mapTarget.name}
          bindingLabel={BINDING_META[mapTarget.type]?.label ?? mapTarget.type}
          resourceLabel={MAP_RESOURCE_LABELS[mapTarget.type]}
          connectionName={connectionName}
          currentValue={
            mappings[mapTarget.name]?.resourceId ?? mappings[mapTarget.name]?.resourceName ?? ''
          }
          onSave={handleMapSave}
        />
      )}
    </div>
  )
}
