import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { DateTimePicker } from '../ui/datetime-picker'
import { api } from '../../lib/api-client'
import type { ApiKeyCreated } from '../../lib/api-client'
import { toast } from 'sonner'

const ORG_SCOPES = [
  { value: 'read', label: 'Read', description: 'View projects, connections, and org variables' },
  {
    value: 'write',
    label: 'Write',
    description: 'Manage projects, connections, marketplace nodes, and org-wide variables',
  },
] as const

const PROJECT_SCOPES = [
  { value: 'read', label: 'Read', description: 'View workflows, runs, and connections' },
  { value: 'write', label: 'Write', description: "Create and modify the project's workflows" },
  { value: 'deploy', label: 'Deploy', description: 'Deploy, trigger, and take down workflows' },
] as const

export type CreateKeyTarget =
  { level: 'org' } | { level: 'project'; projectId: string; projectName: string }

/**
 * Creates a key of one level. Org keys manage organization resources and are
 * refused on project routes; project keys work their project only. A project
 * key will additionally take a workspace selection once the workspaces layer
 * exists (`api_keys.workspaceId` is the planned additive column).
 */
export function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: ApiKeyCreated) => void
  target: CreateKeyTarget
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<string>>(new Set(['read']))
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)

  const scopeOptions = target.level === 'org' ? ORG_SCOPES : PROJECT_SCOPES

  function handleCreated(key: ApiKeyCreated) {
    onCreated(key)
    setName('')
    setScopes(new Set(['read']))
    setExpiresAt(null)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.createApiKey({
        name: name.trim(),
        ...(target.level === 'project' && { projectId: target.projectId }),
        scopes: [...scopes],
        expiresAt: expiresAt?.toISOString() ?? null,
      }),
    onSuccess: handleCreated,
    onError: (err) => toast.error(err.message),
  })

  function toggleScope(scope: string) {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  function handleCreate() {
    createMutation.mutate()
  }

  const canCreate = name.trim() && scopes.size > 0 && !createMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            {target.level === 'org' ? 'Create organization key' : 'Create project key'}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {target.level === 'org'
              ? 'Manages the organization: its projects, connections, marketplace nodes and org-wide variables. Write also creates project keys. Cannot act inside a project — no workflows, files or deploys.'
              : `Works in ${target.projectName} only. Cannot manage organization resources.`}
          </Dialog.Description>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={target.level === 'org' ? 'e.g. Org automation' : 'e.g. CI/CD pipeline'}
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Scopes</label>
              <div className="space-y-1.5">
                {scopeOptions.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.has(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    <div>
                      <span className="text-sm font-medium">{scope.label}</span>
                      <p className="text-xs text-muted-foreground">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Expiration (optional)
              </label>
              <DateTimePicker
                value={expiresAt}
                onChange={setExpiresAt}
                minDate={new Date()}
                placeholder="No expiration"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" disabled={!canCreate} onClick={handleCreate}>
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
