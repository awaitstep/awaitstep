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

/**
 * The org and project an open editor's URL names (`/{org}/{project}/{workspace}/workflows/{id}`),
 * keyed by its slugs. The editor route sets it and clears it on leave; while it is set, API
 * calls go to this project instead of the switcher's, and the switcher's list doesn't reset
 * the active project. A bridge until the editor takes its scope from the route itself.
 */
export interface RouteScope {
  key: string
  organizationId: string
  projectId: string
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
  routeScope: RouteScope | null
  setAppReady: (ready: boolean) => void
  setOrganizations: (orgs: Organization[]) => void
  addOrganization: (org: Organization) => void
  setProjects: (projects: Project[]) => void
  setProjectsFetchState: (projectsFetchState: OrgState['projectsFetchState']) => void
  setProjectsPagination: (hasMore: boolean, loadMore: (() => void) | null) => void
  setProjectsIsFetchingMore: (isFetchingMore: boolean) => void
  setActiveOrganization: (id: string) => void
  setActiveProject: (id: string) => void
  setRouteScope: (scope: RouteScope | null) => void
  clear: () => void
}

export function useOrgReady() {
  return useOrgStore(
    (s) =>
      s.appReady &&
      (!!s.routeScope ||
        (!!s.activeOrganizationId &&
          !!s.activeProjectId &&
          s.projects.some((p) => p.id === s.activeProjectId))),
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
      routeScope: null,
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
      setRouteScope: (routeScope) => set({ routeScope }),
      clear: () =>
        set({
          appReady: false,
          organizations: [],
          projects: [],
          activeOrganizationId: null,
          activeProjectId: null,
          routeScope: null,
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
