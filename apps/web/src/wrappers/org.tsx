import { useEffect } from 'react'
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

export default function OrgWrapper({ organizations }: OrgWrapperProps) {

  const { orgDialogOpen, projectDialogOpen } = useSheetStore(useShallow((s) => ({
    orgDialogOpen: s.orgDialogOpen,
    projectDialogOpen: s.projectDialog !== null,
  })))

  const { needProject } = useOrgStore(useShallow(s => ({
    needProject: s.projects.length === 0 && s.projectsFetchState === 'success',
  })))

  const needsOrg = organizations.length === 0
  const showOrgDialog = orgDialogOpen || needsOrg
  const showProjectDialog = projectDialogOpen || needProject

  useEffect(() => {
    const { activeOrganizationId, setActiveOrganization, setOrganizations, setAppReady } = useOrgStore.getState()
    if (organizations.length > 0) {
      setOrganizations(organizations)
      if (!activeOrganizationId || !organizations.some((o) => o.id === activeOrganizationId)) {
        setActiveOrganization(organizations[0].id)
      }
    }
    setAppReady(true)
  }, [])

  return <>
    <ProjectsWrapper />
    <ConnectionsWrapper />
    {showOrgDialog && <OrgDialog preventClose={needsOrg} />}
    {showProjectDialog && <ProjectDialog preventClose={needProject} />}
  </>
}