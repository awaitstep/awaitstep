import * as Dialog from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { useOnboardingStore } from '../../stores/onboarding-store'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useConnectionsStore } from '../../stores/connections-store'
import { OnboardingWizard } from '../onboarding/onboarding-wizard'

export function useIsNewUser(): boolean {
  const onboardingSkipped = useOnboardingStore((s) => s.skipped)
  const workflows = useWorkflowsStore((s) => s.workflows)
  const wfReady = useWorkflowsStore((s) => s.fetchState === 'success')
  const connections = useConnectionsStore((s) => s.connections)
  const connReady = useConnectionsStore((s) => s.fetchState === 'success')

  return !onboardingSkipped
    && wfReady && connReady
    && workflows.length === 0
    && connections.length === 0
}

export function OnboardingOverlay({ show }: { show: boolean }) {
  if (!show) return null

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/90" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none">
          <VisuallyHidden.Root>
            <Dialog.Title>Onboarding</Dialog.Title>
          </VisuallyHidden.Root>
          <OnboardingWizard />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
