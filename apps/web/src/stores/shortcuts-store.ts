import { create } from 'zustand'

/** The app's own shortcut dialogs: the ⌘K palette and the `?` sheet. One is open at a time. */
export type ShortcutsDialog = 'palette' | 'help'

interface ShortcutsState {
  dialog: ShortcutsDialog | null
  show: (dialog: ShortcutsDialog) => void
  close: () => void
}

export const useShortcutsStore = create<ShortcutsState>()((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}))
