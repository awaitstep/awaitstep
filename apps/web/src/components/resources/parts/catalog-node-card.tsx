import { ArrowUpCircle, Download, Loader2 } from 'lucide-react'
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
  /** Each action shows only when its handler is given: none for people who can't change the org. */
  onInstall?: (nodeId: string) => void
  onUninstall?: (nodeId: string) => void
  onUpdate?: (nodeId: string) => void
  /** A change to this node is in flight. */
  busy?: boolean
  /** Another node's change is in flight: wait for it. */
  disabled?: boolean
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
 * updated and uninstalled (the page confirms first when they're in use);
 * custom nodes always stay installed.
 */
export function CatalogNodeCard({
  node,
  orgName,
  onInstall,
  onUninstall,
  onUpdate,
  busy,
  disabled,
}: CatalogNodeCardProps) {
  const custom = node.source === 'custom'
  const spinner = busy && <Loader2 className="animate-spin" aria-hidden="true" />

  function handleInstall() {
    onInstall?.(node.id)
  }

  function handleUninstall() {
    onUninstall?.(node.id)
  }

  function handleUpdate() {
    onUpdate?.(node.id)
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
      {node.updateAvailable && (
        <p className="text-2xs text-muted-foreground">
          v{node.latestVersion} is out.
          {onUpdate && ' Update to move workflows to it when they’re next deployed.'}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {node.installed ? (
          <>
            <span className="text-2xs text-muted-foreground">{describeUsage(node.usage)}</span>
            <span className="flex-1" />
            {node.updateAvailable && <Badge variant="warning">Update available</Badge>}
            {node.updateAvailable && onUpdate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUpdate}
                disabled={busy || disabled}
                aria-busy={busy || undefined}
                aria-label={`Update ${node.name} to v${node.latestVersion}`}
              >
                {spinner || <ArrowUpCircle aria-hidden="true" />}
                Update
              </Button>
            )}
            {!custom && onUninstall && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUninstall}
                disabled={busy || disabled}
                aria-busy={busy || undefined}
              >
                {spinner}
                Uninstall
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="flex-1" />
            {onInstall && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleInstall}
                disabled={busy || disabled}
                aria-busy={busy || undefined}
                aria-label={`Install ${node.name} for every project in ${orgName}`}
              >
                {spinner || <Download aria-hidden="true" />}
                Install
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  )
}
