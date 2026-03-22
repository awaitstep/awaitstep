import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Organization {
  id: string
  name: string
  slug: string
  logo?: string | null
  createdAt: string | Date
}

export interface Project {
  id: string
  organizationId: string
  name: string
  slug: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

interface OrgState {
  appReady: boolean
  organizations: Organization[]
  projects: Project[]
  activeOrganizationId: string | null
  activeProjectId: string | null
  setAppReady: (ready: boolean) => void
  setOrganizations: (orgs: Organization[]) => void
  setProjects: (projects: Project[]) => void
  setActiveOrganization: (id: string) => void
  setActiveProject: (id: string) => void
  clear: () => void
}

export function useOrgReady() {
  return useOrgStore((s) => s.appReady && !!s.activeOrganizationId && !!s.activeProjectId)
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      appReady: false,
      organizations: [],
      projects: [],
      activeOrganizationId: null,
      activeProjectId: null,
      setAppReady: (appReady) => set({ appReady }),
      setOrganizations: (organizations) => set({ organizations }),
      setProjects: (projects) => set({ projects }),
      setActiveOrganization: (id) => set({ activeOrganizationId: id, activeProjectId: null }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      clear: () => set({ appReady: false, organizations: [], projects: [], activeOrganizationId: null, activeProjectId: null }),
    }),
    {
      name: 'awaitstep-org',
      partialize: (state) => ({
        organizations: state.organizations,
        projects: state.projects,
        activeOrganizationId: state.activeOrganizationId,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
)
