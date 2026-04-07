import { createFileRoute } from '@tanstack/react-router'
import { useOrgStore } from '../../stores/org-store'
import { OrgNameEditor } from '../../components/org/org-name-editor'
import { ProjectsList } from '../../components/org/projects-list'
import { ApiKeysSection } from '../../components/org/api-keys-section'
import { useShallow } from 'zustand/react/shallow'
import { RequireOrg } from '../../wrappers/require-org'
import { PageHeader } from '../../components/ui/page-header'

export const Route = createFileRoute('/_authed/settings')({
  head: () => ({ meta: [{ title: 'Settings | AwaitStep' }] }),
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <RequireOrg>
      <SettingsContent />
    </RequireOrg>
  )
}

function SettingsContent() {
  const { activeOrg, projects, projectsLoading } = useOrgStore(
    useShallow((s) => ({
      activeOrg: s.organizations.find((o) => o.id === s.activeOrganizationId),
      projects: s.projects,
      projectsLoading: s.projectsFetchState !== 'success',
    })),
  )

  return (
    <div>
      <PageHeader
        title="Settings"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Settings' }]}
      />
      {activeOrg ? (
        <OrgNameEditor org={activeOrg} />
      ) : (
        <div className="mt-6 px-2 py-1">
          <div className="h-7 w-48 animate-pulse rounded bg-muted/60" />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ProjectsList projects={projects} loading={projectsLoading} />
        <ApiKeysSection />
      </div>
    </div>
  )
}
