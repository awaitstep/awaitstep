import { Download, Loader2 } from 'lucide-react'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Tile } from '../../ui/tile'
import type { OrgNode } from '../../../types/dashboard/resources'

type TileTone = 'ok' | 'info' | 'warn' | 'neutral'

const CATEGORY_TONE: Record<string, TileTone> = {
  AI: 'info',
  Data: 'ok',
  Messaging: 'warn',
  Payments: 'ok',
}

interface CatalogNodeCardProps {
  node: OrgNode
  /** Names who an install reaches: "Install Slack for every project in Acme Inc". */
  orgName: string
  onInstall?: (nodeId: string) => void
  onUninstall?: (nodeId: string) => void
  /** An install or uninstall of this node is in flight. */
  busy?: boolean
}

function describeVersion(node: OrgNode): string {
  const version = `${node.category} · v${node.version}`
  return node.author ? `${version} · by ${node.author}` : version
}

function describeUsage(usage: number | undefined): string {
  if (!usage) return 'Not used yet'
  return `Used in ${usage} ${usage === 1 ? 'workflow' : 'workflows'}`
}

/**
 * A node on the org's Resources page. Installed marketplace nodes can be
 * uninstalled (the page confirms first when they're in use); custom nodes
 * always stay installed.
 */
export function CatalogNodeCard({
  node,
  orgName,
  onInstall,
  onUninstall,
  busy,
}: CatalogNodeCardProps) {
  const custom = node.source === 'custom'

  function handleInstall() {
    onInstall?.(node.id)
  }

  function handleUninstall() {
    onUninstall?.(node.id)
  }

  return (
    <article
      aria-label={node.name}
      className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4.5"
    >
      <div className="flex items-center gap-3">
        <Tile tone={custom ? 'info' : (CATEGORY_TONE[node.category] ?? 'neutral')}>
          {node.name.charAt(0)}
        </Tile>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-sm font-semibold text-foreground">{node.name}</h3>
          <span className="truncate text-2xs text-muted-foreground">{describeVersion(node)}</span>
        </div>
        <Badge variant={custom ? 'info' : 'neutral'}>{custom ? 'Custom' : 'Marketplace'}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{node.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {node.installed ? (
          <>
            <span className="text-2xs text-muted-foreground">{describeUsage(node.usage)}</span>
            <span className="flex-1" />
            {node.updateAvailable && <Badge variant="warning">Update available</Badge>}
            {!custom && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUninstall}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                Uninstall
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleInstall}
              disabled={busy}
              aria-busy={busy || undefined}
              aria-label={`Install ${node.name} for every project in ${orgName}`}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              Install
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
