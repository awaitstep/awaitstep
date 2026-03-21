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
  activeOrganizationId: string | null
  activeProjectId: string | null
  setActiveOrganization: (id: string) => void
  setActiveProject: (id: string) => void
  clear: () => void
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      activeOrganizationId: null,
      activeProjectId: null,
      setActiveOrganization: (id) => set({ activeOrganizationId: id, activeProjectId: null }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      clear: () => set({ activeOrganizationId: null, activeProjectId: null }),
    }),
    { name: 'awaitstep-org' },
  ),
)
