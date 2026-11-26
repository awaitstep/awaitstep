export interface SlotTargets {
  /** In the desktop top bar, hidden below `md`. */
  topBar: HTMLElement | null
  /** The strip under the phone header, hidden from `md`. */
  phone: HTMLElement | null
}

/**
 * Where a page's top bar content goes: the strip under the phone header on
 * a phone, else the top bar. A frame with no strip (tests, a bare layout)
 * keeps it in the top bar.
 */
export function slotTargetFor(targets: SlotTargets, phone: boolean): HTMLElement | null {
  return phone && targets.phone ? targets.phone : targets.topBar
}
