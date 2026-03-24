import * as Dialog from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { OnboardingWizard } from '../onboarding/onboarding-wizard'
import { useCanOnboard } from '../../hooks/use-can-onboard'

export function OnboardingOverlay() {
  const canOnboard = useCanOnboard()
  if (!canOnboard) {
    return null
  }

  return (
    <Dialog.Root open={canOnboard}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/90" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          <VisuallyHidden.Root>
            <Dialog.Title>Onboarding</Dialog.Title>
          </VisuallyHidden.Root>
          <OnboardingWizard />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
