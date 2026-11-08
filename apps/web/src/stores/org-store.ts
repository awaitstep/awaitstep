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

interface OrgState {
  appReady: boolean
  organizations: Organization[]
  activeOrganizationId: string | null
  /** The old client's default project; a workflow's URL binds its own. */
  activeProjectId: string | null
  setAppReady: (ready: boolean) => void
  setOrganizations: (orgs: Organization[]) => void
  addOrganization: (org: Organization) => void
  setActiveOrganization: (id: string) => void
  setActiveProject: (id: string) => void
  clear: () => void
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      appReady: false,
      organizations: [],
      activeOrganizationId: null,
      activeProjectId: null,
      setAppReady: (appReady) => set({ appReady }),
      setOrganizations: (organizations) => set({ organizations }),
      addOrganization: (org: Organization) =>
        set((s) => ({ organizations: [...s.organizations, org] })),
      setActiveOrganization: (id) => set({ activeOrganizationId: id, activeProjectId: null }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      clear: () =>
        set({
          appReady: false,
          organizations: [],
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
