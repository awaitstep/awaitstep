import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TemplateResolver } from '@awaitstep/codegen'
import { useApiOrganizationId, useApiReady, useQueries } from '../contexts/api-client-context'
import { useNodeRegistry } from '../contexts/node-registry-context'
import { isCustomNodeType } from '../lib/node-categories'

type TemplatesByNode = Record<string, Record<string, string>>

const NO_TEMPLATES: TemplatesByNode = {}

/**
 * The node templates the code generator needs, fetched only while a preview
 * that generates code is on screen (`enabled`). Without them, built-in steps still generate
 * from their own data; a custom node would otherwise preview as an empty call.
 * Inside a workflow, the templates of the Library nodes in `nodeTypes` (the
 * graph's) join the registry's; no other node's code is fetched.
 */
export function useNodeTemplates(
  nodeTypes: Iterable<string> = [],
  { enabled = true }: { enabled?: boolean } = {},
): TemplateResolver {
  const organizationId = useApiOrganizationId()
  const { workflowId, registry } = useNodeRegistry()
  const queries = useQueries()
  const ready = useApiReady()
  const [templates, setTemplates] = useState<TemplatesByNode>({})
  // The org the registry templates were fetched for: once is enough.
  const [fetchedFor, setFetchedFor] = useState<{ organizationId: typeof organizationId } | null>(
    null,
  )
  const typeList = [...new Set(nodeTypes)].filter(isCustomNodeType).sort()
  // A stable key: the same placed types give the same string across renders.
  const typesKey = typeList.join(',')
  const customTypes = useMemo(() => (typesKey ? typesKey.split(',') : []), [typesKey])
  const { data: custom = NO_TEMPLATES } = useQuery({
    ...queries.workflows.customNodeTemplates(workflowId ?? '', customTypes),
    enabled: enabled && ready && !!workflowId && customTypes.length > 0,
  })

  useEffect(() => {
    if (!enabled || fetchedFor?.organizationId === organizationId) return
    let cancelled = false
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
    fetch(`/api/nodes/templates${query}`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TemplatesByNode | null) => {
        if (cancelled || !data) return
        setTemplates(data)
        setFetchedFor({ organizationId })
      })
      .catch(() => {
        // The bundled templates still generate; only a custom node's body is missing.
      })
    return () => {
      cancelled = true
    }
  }, [organizationId, enabled, fetchedFor])

  return useMemo<TemplateResolver>(() => {
    const all: TemplatesByNode = { ...templates, ...custom }
    return {
      getTemplate(nodeType: string, provider?: string): string | undefined {
        if (!Object.hasOwn(all, nodeType)) return undefined
        const byProvider = all[nodeType]!
        if (!provider) return Object.values(byProvider)[0]
        return Object.hasOwn(byProvider, provider) ? byProvider[provider] : undefined
      },
      // The preview generates what a deploy would: the node.json retries and timeout.
      getRuntime: (nodeType: string) => registry?.get(nodeType)?.runtime,
    }
  }, [templates, custom, registry])
}
