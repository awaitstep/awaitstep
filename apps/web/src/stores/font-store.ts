import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const FONTS = [
  { id: 'outfit', label: 'Outfit', family: "'Outfit'" },
  { id: 'geist', label: 'Geist', family: "'Geist'" },
  { id: 'ibm-plex', label: 'IBM Plex Sans', family: "'IBM Plex Sans'" },
  { id: 'dm-sans', label: 'DM Sans', family: "'DM Sans'" },
  { id: 'plus-jakarta', label: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans'" },
  { id: 'inter', label: 'Inter', family: "'Inter'" },
] as const

export type FontId = (typeof FONTS)[number]['id']

interface FontState {
  font: FontId
  setFont: (font: FontId) => void
}

export const useFontStore = create<FontState>()(
  persist(
    (set) => ({
      font: 'outfit',
      setFont: (font) => set({ font }),
    }),
    { name: 'awaitstep-font', storage: createJSONStorage(() => localStorage) },
  ),
)
