/**
 * Where the top bar gives things up, as widths of the bar itself.
 *
 * The bar collapses by container queries on its own width, not the window's,
 * so it cannot disagree with the room it really has. Each step is one thing
 * going from text to icon, or from the bar into the ⋯ menu, in the order the
 * person misses it least. The classes in the bar spell the same numbers out
 * literally (Tailwind needs them in the source); `top-bar-layout.test.ts`
 * fails when a class and this table drift apart, and when any width has less
 * room than what it shows.
 */
export const BAR_TIERS = {
  /** The view toggles sit on the bar; below this they are listed in ⋯. */
  toggles: 520,
  /** Canvas | Code show their names, not just icons. */
  switchLabels: 640,
  /** Undo and Redo sit on the bar; below this they live in ⋯. */
  history: 680,
  /** "View only" sits on the bar; below this it is listed in ⋯. */
  access: 800,
  /** An old version's badge says "back to latest" in full, not just "latest". */
  versionText: 880,
  /** Save, Preview and the other labelled toggles show their words. */
  labels: 800,
  /** Deploy shows its word. */
  deployLabel: 800,
  /** The node count pill sits beside the name; below this it is listed in ⋯. */
  nodeCount: 880,
  /** Code reserves the empty Deploy slot so ⋯ keeps its place. */
  deploySlot: 1040,
  /** "Saved", "Unsaved" and "Couldn't save" show their words, not just icons. */
  statusText: 940,
  /** The deploy pill sits beside the name; below this it is listed in ⋯. */
  deployPill: 1240,
} as const

export type BarTier = keyof typeof BAR_TIERS

/** What the bar has moved into ⋯ at this width. */
export function collapsedAt(width: number): Collapsed {
  return {
    always: true as const,
    toggles: width < BAR_TIERS.toggles,
    history: width < BAR_TIERS.history,
    access: width < BAR_TIERS.access,
    nodeCount: width < BAR_TIERS.nodeCount,
    deployPill: width < BAR_TIERS.deployPill,
  }
}

export interface Collapsed {
  /** Moved into ⋯ at every width. */
  always: true
  toggles: boolean
  history: boolean
  access: boolean
  nodeCount: boolean
  deployPill: boolean
}
