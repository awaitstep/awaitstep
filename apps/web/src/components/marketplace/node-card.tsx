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
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            visuals.accent,
          )}
        >
          {visuals.paletteIcon}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">{node.name}</span>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {node.description}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground/60">
          {node.author} &middot; v{node.latest}
        </span>
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
    </div>
  )
}
