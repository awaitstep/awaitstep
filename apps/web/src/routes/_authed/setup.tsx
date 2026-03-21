import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Building2, FolderKanban, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { authClient } from '../../lib/auth-client'
import { api } from '../../lib/api-client'
import { useOrgStore } from '../../stores/org-store'

export const Route = createFileRoute('/_authed/setup')({
  component: SetupPage,
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'default'
}

function SetupPage() {
  const [orgName, setOrgName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setActiveOrg = useOrgStore((s) => s.setActiveOrganization)
  const setActiveProject = useOrgStore((s) => s.setActiveProject)

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
      await authClient.organization.setActive({ organizationId: org.id })
      setActiveOrg(org.id)

      const project = await api.createProject({
        name: projectName.trim(),
        slug: slugify(projectName),
      })
      setActiveProject(project.id)

      window.location.href = '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Get started</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your organization and first project to start building workflows.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="org-name" className="flex items-center gap-2">
              <Building2 size={14} />
              Organization name
            </Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc."
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Your team or company name. You can invite members later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-name" className="flex items-center gap-2">
              <FolderKanban size={14} />
              Project name
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Project"
              required
            />
            <p className="text-xs text-muted-foreground">
              A project groups your workflows together. You can create more later.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading || !orgName.trim() || !projectName.trim()} className="w-full gap-2">
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            Continue
          </Button>
        </form>
      </div>
    </div>
  )
}
