import { useEffect, useMemo, useState } from 'react'
import type { TemplateResolver } from '@awaitstep/codegen'
import { useApiOrganizationId } from '../contexts/api-client-context'

type TemplatesByNode = Record<string, Record<string, string>>

/**
 * The node templates the code generator needs, fetched only while a preview
 * that generates code is on screen. Without them, built-in steps still generate
 * from their own data; a custom node would otherwise preview as an empty call.
 */
export function useNodeTemplates(): TemplateResolver {
  const organizationId = useApiOrganizationId()
  const [templates, setTemplates] = useState<TemplatesByNode>({})

  useEffect(() => {
    let cancelled = false
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
    fetch(`/api/nodes/templates${query}`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TemplatesByNode | null) => {
        if (!cancelled && data) setTemplates(data)
      })
      .catch(() => {
        // The bundled templates still generate; only a custom node's body is missing.
      })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  return useMemo<TemplateResolver>(
    () => ({
      getTemplate(nodeType: string, provider?: string): string | undefined {
        if (!Object.hasOwn(templates, nodeType)) return undefined
        const byProvider = templates[nodeType]!
        if (!provider) return Object.values(byProvider)[0]
        return Object.hasOwn(byProvider, provider) ? byProvider[provider] : undefined
      },
    }),
    [templates],
  )
}
