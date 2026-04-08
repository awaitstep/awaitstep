import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Search, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { api, type MarketplaceNodeEntry } from '../../lib/api-client'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { NodeCard } from './node-card'
import { CategoryFilterSidebar } from '../ui/category-filter'
import {
  groupByCategory,
  getPopulatedCategories,
  filterNodes,
  getSuperCategoryMeta,
  type SuperCategory,
} from '../../lib/node-categories'
import { cn } from '../../lib/utils'

interface MarketplaceDialogProps {
  onOpenChange: (open: boolean) => void
}

export function MarketplaceDialog({ onOpenChange }: MarketplaceDialogProps) {
  const queryClient = useQueryClient()
  const { refresh } = useNodeRegistry()
  const [search, setSearch] = useState('')
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showInstalledOnly, setShowInstalledOnly] = useState(false)

  function onMutationSuccess() {
    queryClient.invalidateQueries({ queryKey: ['marketplace'] })
    refresh()
  }

  function onMutationError(err: unknown, action: string) {
    toast.error(`Failed to ${action} node`, {
      description: err instanceof Error ? err.message : undefined,
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace'],
    queryFn: () => api.browseMarketplace(),
  })

  const installMutation = useMutation({
    mutationFn: (nodeId: string) => api.installNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      toast.success('Node installed')
      onMutationSuccess()
    },
    onError: (err) => onMutationError(err, 'install'),
  })

  const uninstallMutation = useMutation({
    mutationFn: (nodeId: string) => api.uninstallNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      toast.success('Node uninstalled')
      onMutationSuccess()
    },
    onError: (err) => onMutationError(err, 'uninstall'),
  })

  const updateMutation = useMutation({
    mutationFn: (nodeId: string) => api.updateNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      toast.success('Node updated')
      onMutationSuccess()
    },
    onError: (err) => onMutationError(err, 'update'),
  })

  const nodes = data?.nodes ?? []

  const filtered = useMemo(() => {
    let items = nodes
    if (showInstalledOnly) {
      items = items.filter((n) => n.installed)
    }
    if (search) {
      items = filterNodes(items, search)
    }
    return items
  }, [nodes, search, showInstalledOnly])

  const populatedCategories = useMemo(() => getPopulatedCategories(filtered), [filtered])
  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  const visibleGroups = useMemo((): Map<SuperCategory, MarketplaceNodeEntry[]> => {
    if (activeCategory) {
      const items = grouped.get(activeCategory as SuperCategory)
      return items ? new Map([[activeCategory as SuperCategory, items]]) : new Map()
    }
    return grouped
  }, [grouped, activeCategory])

  return (
    <Dialog.Root defaultOpen onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 mx-4 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-foreground">
              Node Marketplace
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                onClick={() => setShowInstalledOnly(!showInstalledOnly)}
                className={cn(
                  'shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  showInstalledOnly
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                Installed
              </button>
            </div>
          </div>

          <div className="flex">
            <div className="hidden w-44 shrink-0 border-r border-border p-2 sm:block">
              <CategoryFilterSidebar
                categories={populatedCategories}
                active={activeCategory}
                onChange={setActiveCategory}
              />
            </div>

            <div className="h-[32rem] min-w-0 flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visibleGroups.size === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {search || showInstalledOnly
                    ? 'No nodes match your filters'
                    : 'No nodes available'}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {[...visibleGroups.entries()].map(([superCat, groupNodes]) => {
                    const meta = getSuperCategoryMeta(superCat)
                    return (
                      <div key={superCat}>
                        {!activeCategory && (
                          <div className="mb-2 px-1">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                              {meta.label}
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {groupNodes.map((node) => (
                            <NodeCard
                              key={node.id}
                              node={node}
                              onInstall={(id) => installMutation.mutate(id)}
                              onUninstall={(id) => uninstallMutation.mutate(id)}
                              onUpdate={(id) => updateMutation.mutate(id)}
                              loading={loadingNodeId}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
