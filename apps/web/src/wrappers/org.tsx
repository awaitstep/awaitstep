import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSheetStore } from '../stores/sheet-store'
import { useOrgStore, type Organization } from '../stores/org-store'
import { OrgDialog } from '../components/org/org-dialog'
import { ProjectDialog } from '../components/org/project-dialog'
import ProjectsWrapper from './projects'
import ConnectionsWrapper from './connections'

interface OrgWrapperProps {
  organizations: Organization[]
}

function hydrateOrgStore(organizations: Organization[]) {
  const { activeOrganizationId, setActiveOrganization, setOrganizations, setAppReady } =
    useOrgStore.getState()
  if (organizations.length > 0) {
    setOrganizations(organizations)
    if (!activeOrganizationId || !organizations.some((o) => o.id === activeOrganizationId)) {
      setActiveOrganization(organizations[0].id)
    }
  }
  setAppReady(true)
}

export default function OrgWrapper({ organizations }: OrgWrapperProps) {
  const hydrated = useRef(false)
  if (!hydrated.current) {
    hydrateOrgStore(organizations)
    hydrated.current = true
  }

  const { orgDialogOpen, projectDialogOpen } = useSheetStore(
    useShallow((s) => ({
      orgDialogOpen: s.orgDialogOpen,
      projectDialogOpen: s.projectDialog !== null,
    })),
  )

  // With no organization the layout sends you to /dashboard, which creates one;
  // this dialog is the old switcher's "New organization" only.
  return (
    <>
      <ProjectsWrapper />
      <ConnectionsWrapper />
      {orgDialogOpen && <OrgDialog hasOrgs />}
      {projectDialogOpen && <ProjectDialog />}
    </>
  )
}
