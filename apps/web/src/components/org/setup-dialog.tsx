import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Building2, FolderKanban, Loader2, ArrowRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { authClient } from '../../lib/auth-client'
import { api } from '../../lib/api-client'
import { slugify } from '../../lib/slug'
import { useOrgStore } from '../../stores/org-store'

export function SetupDialog({ open }: { open: boolean }) {
  const queryClient = useQueryClient()
  const [orgName, setOrgName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setOrgs = useOrgStore((s) => s.setOrganizations)
  const setActiveOrg = useOrgStore((s) => s.setActiveOrganization)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim() || !projectName.trim()) return

    setLoading(true)
    setError(null)

    try {
      const orgResult = await authClient.organization.create({
        name: orgName.trim(),
        slug: slugify(orgName),
      })

      if (orgResult.error) {
        throw new Error(orgResult.error.message ?? 'Failed to create organization')
      }

      const org = orgResult.data
      setOrgs([org])
      setActiveOrg(org.id)

      await api.createProject({
        name: projectName.trim(),
        slug: slugify(projectName),
      })

      // ProjectsProvider will pick up the new project via this invalidation
      queryClient.invalidateQueries({ queryKey: ['projects', org.id] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const canSubmit = orgName.trim() && projectName.trim() && !loading

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-xl font-semibold">Get started</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Create your organization and first project to start building workflows.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="org-name" className="flex items-center gap-2 text-xs">
                <Building2 size={14} />
                Organization name
              </Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Inc."
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground/60">
                Your team or company name. You can invite members later.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-name" className="flex items-center gap-2 text-xs">
                <FolderKanban size={14} />
                Project name
              </Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
              />
              <p className="text-[10px] text-muted-foreground/60">
                A project groups your workflows together. You can create more later.
              </p>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" disabled={!canSubmit} className="w-full gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Continue
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
