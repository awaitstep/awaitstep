import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Search, Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api } from '../../lib/api-client'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { NodeCard } from './node-card'

interface MarketplaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MarketplaceDialog({ open, onOpenChange }: MarketplaceDialogProps) {
  const queryClient = useQueryClient()
  const { refresh } = useNodeRegistry()
  const [search, setSearch] = useState('')
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace'],
    queryFn: () => api.browseMarketplace(),
    enabled: open,
  })

  const installMutation = useMutation({
    mutationFn: (nodeId: string) => api.installNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      refresh()
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (nodeId: string) => api.uninstallNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      refresh()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (nodeId: string) => api.updateNode(nodeId),
    onMutate: (nodeId) => setLoadingNodeId(nodeId),
    onSettled: () => setLoadingNodeId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      refresh()
    },
  })

  const nodes = data?.nodes ?? []
  const filtered = search
    ? nodes.filter(
        (n) =>
          n.name.toLowerCase().includes(search.toLowerCase()) ||
          n.description.toLowerCase().includes(search.toLowerCase()) ||
          n.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : nodes

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-foreground">
              Node Marketplace
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {search ? 'No nodes match your search' : 'No nodes available'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((node) => (
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
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
