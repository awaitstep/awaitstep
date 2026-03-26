import { Loader2, Download, Trash2, ArrowUpCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { getNodeVisuals } from '../../lib/node-icon-map'
import type { MarketplaceNodeEntry } from '../../lib/api-client'

interface NodeCardProps {
  node: MarketplaceNodeEntry
  onInstall: (nodeId: string) => void
  onUninstall: (nodeId: string) => void
  onUpdate: (nodeId: string) => void
  loading?: string | null
}

export function NodeCard({ node, onInstall, onUninstall, onUpdate, loading }: NodeCardProps) {
  const isLoading = loading === node.id
  const hasUpdate = node.installed && node.installedVersion !== node.latest
  const visuals = getNodeVisuals(node.id, node.icon)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          visuals.accent,
        )}
      >
        {visuals.paletteIcon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{node.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {node.category}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{node.description}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <span>{node.author}</span>
          <span>v{node.latest}</span>
        </div>
      </div>
      <div className="shrink-0">
        {node.installed ? (
          <div className="flex items-center gap-1">
            {hasUpdate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdate(node.id)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />}
                Update
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUninstall(node.id)}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => onInstall(node.id)} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Download />}
            Install
          </Button>
        )}
      </div>
    </div>
  )
}
