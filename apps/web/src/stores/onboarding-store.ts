import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface OnboardingState {
  skipped: boolean
  skip: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      skipped: false,
      skip: () => set({ skipped: true }),
    }),
    { name: 'awaitstep-onboarding', storage: createJSONStorage(() => localStorage) },
  ),
)
