import { createFileRoute } from '@tanstack/react-router'
import { useOrgStore } from '../../stores/org-store'
import { OrgNameEditor } from '../../components/org/org-name-editor'
import { ProjectsList } from '../../components/org/projects-list'
import { ApiKeysSection } from '../../components/org/api-keys-section'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const orgs = useOrgStore((s) => s.organizations)
  const projects = useOrgStore((s) => s.projects)
  const activeOrgId = useOrgStore((s) => s.activeOrganizationId)

  const activeOrg = orgs.find((o) => o.id === activeOrgId)

  return (
    <div>
      <h1 className="border-b border-border pb-4 text-lg font-semibold">Settings</h1>
      {activeOrg && <OrgNameEditor org={activeOrg} />}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ProjectsList projects={projects} />
        <ApiKeysSection />
      </div>
    </div>
  )
}
