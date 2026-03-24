import { useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../stores/org-store'
import { useSheetStore } from '../stores/sheet-store'
import { RequireOrg } from './require-org'
import { LoadingView } from '../components/ui/loading-view'
import { PageSkeleton } from '../components/ui/page-skeleton'

export function RequireProject({ children }: { children: ReactNode }) {
  return (
    <RequireOrg>
      <ProjectGate>{children}</ProjectGate>
    </RequireOrg>
  )
}

function ProjectGate({ children }: { children: ReactNode }) {
  const { hasProject, isFetched } = useOrgStore(
    useShallow((s) => ({
      hasProject: s.projects.length > 0 && !!s.activeProjectId,
      isFetched: s.projectsFetchState === 'success',
    })),
  )

  useEffect(() => {
    if (isFetched && !hasProject) {
      useSheetStore.getState().guardAction('project')
    }
  }, [isFetched, hasProject])

  return (
    <LoadingView isLoading={!isFetched || !hasProject} LoadingPlaceholder={PageSkeleton}>
      {children}
    </LoadingView>
  )
}
