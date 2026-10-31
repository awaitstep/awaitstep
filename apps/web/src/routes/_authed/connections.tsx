import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// The old Connections page: Org Settings › Connections now (B9). `?new=true`
// (the deploy page's "add one" link) opens Connect Cloudflare there.
export const Route = createFileRoute('/_authed/connections')({
  ssr: false,
  validateSearch: z.object({ new: z.boolean().optional() }).parse,
  component: ConnectionsRedirect,
})

function ConnectionsRedirect() {
  const search = Route.useSearch()
  return (
    <LegacyRedirect
      page={{ settings: 'connections', ...(search.new && { newDialog: 'connection' as const }) }}
    />
  )
}
