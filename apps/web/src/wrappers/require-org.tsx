import { useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOrgStore } from '../stores/org-store'
import { useSheetStore } from '../stores/sheet-store'
import { LoadingView } from '../components/ui/loading-view'
import { PageSkeleton } from '../components/ui/page-skeleton'

export function RequireOrg({ children }: { children: ReactNode }) {
  const { hasOrg, appReady } = useOrgStore(
    useShallow((s) => ({
      hasOrg: s.organizations.length > 0 && !!s.activeOrganizationId,
      appReady: s.appReady,
    })),
  )

  useEffect(() => {
    if (appReady && !hasOrg) {
      useSheetStore.getState().guardAction('org')
    }
  }, [appReady, hasOrg])

  return (
    <LoadingView isLoading={!hasOrg || !appReady} LoadingPlaceholder={PageSkeleton}>
      {children}
    </LoadingView>
  )
}
