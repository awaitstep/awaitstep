import { useRef } from 'react'
import { useOrgStore, type Organization } from '../stores/org-store'

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

/**
 * Hands the layout's organizations to the store the old client reads. The
 * dialogs it used to host are the dashboard's own now.
 */
export default function OrgWrapper({ organizations }: OrgWrapperProps) {
  const hydrated = useRef(false)
  if (!hydrated.current) {
    hydrateOrgStore(organizations)
    hydrated.current = true
  }
  return null
}
