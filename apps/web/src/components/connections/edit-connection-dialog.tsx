import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'

export function EditConnectionDialog({
  connection,
  onClose,
}: {
  connection: { id: string; name: string; accountId: string } | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleEditOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleTokenChange(e: React.ChangeEvent<HTMLInputElement>) {
    setApiToken(e.target.value)
    setError(null)
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const data: { name?: string; credentials?: Record<string, string> } = {}
      if (name !== connection?.name) data.name = name
      if (apiToken.trim()) data.credentials = { accountId: connection?.accountId ?? '', apiToken }
      return api.updateConnection(connection!.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update connection')
    },
  })

  // Keep name in sync when opening with a new connection
  if (connection && name === '' && connection.name) {
    setName(connection.name)
  }

  return (
    <Dialog.Root open={!!connection} onOpenChange={handleEditOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold text-foreground">Edit Connection</Dialog.Title>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Account ID</label>
              <input
                type="text"
                value={connection?.accountId ?? ''}
                disabled
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-muted-foreground/60"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">API Token</label>
              <input
                type="password"
                value={apiToken}
                onChange={handleTokenChange}
                placeholder="Leave blank to keep current token"
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!name.trim() || (name === connection?.name && !apiToken.trim()) || updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
              >
                {updateMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
