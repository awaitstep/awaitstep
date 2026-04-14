import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { browserStorage } from './ssr-safe-storage'

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
  projectsFetchState: 'loading' | 'success' | 'error'
  projectsHasMore: boolean
  projectsLoadMore: (() => void) | null
  projectsIsFetchingMore: boolean
  activeOrganizationId: string | null
  activeProjectId: string | null
  setAppReady: (ready: boolean) => void
  setOrganizations: (orgs: Organization[]) => void
  addOrganization: (org: Organization) => void
  setProjects: (projects: Project[]) => void
  setProjectsFetchState: (projectsFetchState: OrgState['projectsFetchState']) => void
  setProjectsPagination: (hasMore: boolean, loadMore: (() => void) | null) => void
  setProjectsIsFetchingMore: (isFetchingMore: boolean) => void
  setActiveOrganization: (id: string) => void
  setActiveProject: (id: string) => void
  clear: () => void
}

export function useOrgReady() {
  return useOrgStore(
    (s) =>
      s.appReady &&
      !!s.activeOrganizationId &&
      !!s.activeProjectId &&
      s.projects.some((p) => p.id === s.activeProjectId),
  )
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      appReady: false,
      projectsFetchState: 'loading',
      projectsHasMore: false,
      projectsLoadMore: null,
      projectsIsFetchingMore: false,
      organizations: [],
      projects: [],
      activeOrganizationId: null,
      activeProjectId: null,
      setAppReady: (appReady) => set({ appReady }),
      setOrganizations: (organizations) => set({ organizations }),
      addOrganization: (org: Organization) =>
        set((s) => ({ organizations: [...s.organizations, org] })),
      setProjects: (projects: Project[]) => set({ projects }),
      setProjectsFetchState: (projectsFetchState: OrgState['projectsFetchState']) =>
        set({ projectsFetchState }),
      setProjectsPagination: (projectsHasMore, projectsLoadMore) =>
        set({ projectsHasMore, projectsLoadMore }),
      setProjectsIsFetchingMore: (projectsIsFetchingMore) => set({ projectsIsFetchingMore }),
      setActiveOrganization: (id) => set({ activeOrganizationId: id, activeProjectId: null }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      clear: () =>
        set({
          appReady: false,
          organizations: [],
          projects: [],
          activeOrganizationId: null,
          activeProjectId: null,
        }),
    }),
    {
      name: 'awaitstep-org',
      storage: createJSONStorage(() => browserStorage()),
      partialize: (state) => ({
        activeOrganizationId: state.activeOrganizationId,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
)
