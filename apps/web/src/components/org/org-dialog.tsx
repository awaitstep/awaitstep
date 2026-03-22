import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { authClient } from '../../lib/auth-client'
import { slugify } from '../../lib/slug'
import { useSheetStore } from '../../stores/sheet-store'
import { useOrgStore } from '../../stores/org-store'
import { toast } from 'sonner'

export function OrgDialog() {
  const open = useSheetStore((s) => s.orgDialogOpen)
  const closeOrgDialog = useSheetStore((s) => s.closeOrgDialog)
  const orgs = useOrgStore((s) => s.organizations)
  const setOrgs = useOrgStore((s) => s.setOrganizations)
  const setActiveOrg = useOrgStore((s) => s.setActiveOrganization)

  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(openState: boolean) {
    if (!openState) closeOrgDialog()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const slug = slugify(name)
      const res = await authClient.organization.create({ name: name.trim(), slug })
      if (res.error) throw new Error(res.error.message)
      const newOrg = res.data
      setOrgs([...orgs, newOrg])
      setActiveOrg(newOrg.id)
      setName('')
      closeOrgDialog()
      toast.success('Organization created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">New Organization</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Create a new organization for your team.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Organization name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." className="mt-1" autoFocus />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button size="sm" disabled={!name.trim() || loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
