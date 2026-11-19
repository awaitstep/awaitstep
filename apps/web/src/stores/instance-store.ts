import { create } from 'zustand'

interface InstanceState {
  /** Ids of the extensions the API instance turns on (`GET /api/instance`). */
  features: readonly string[]
  setFeatures: (features: readonly string[]) => void
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  features: [],
  setFeatures: (features) => {
    // The layout hands over the same loader data on every render: no change, no update.
    const current = get().features
    if (current.length === features.length && current.every((id, i) => id === features[i])) return
    set({ features })
  },
}))
