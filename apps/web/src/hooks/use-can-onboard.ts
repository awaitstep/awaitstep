import { useShallow } from 'zustand/react/shallow'
import { useConnectionsStore } from '../stores/connections-store'
import { useWorkflowsStore } from '../stores/workflows-store'
import { useOnboardingStore } from '../stores/onboarding-store'

export function useCanOnboard(): boolean {
  const onboardingSkipped = useOnboardingStore((s) => s.skipped)

  const { hasZeroConn } = useConnectionsStore(
    useShallow((s) => ({
      hasZeroConn: s.fetchState === 'success' && s.connections.length === 0,
    })),
  )

  const { hasZeroWf } = useWorkflowsStore(
    useShallow((s) => ({
      hasZeroWf: s.fetchState === 'success' && s.workflows.length === 0,
    })),
  )

  return !onboardingSkipped && hasZeroWf && hasZeroConn
}
