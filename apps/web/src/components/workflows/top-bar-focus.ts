/** Hands focus back to the bar's ⋯ button, where a panel it opened was closed with Esc. */
export function focusMoreActions() {
  document.querySelector<HTMLElement>('[data-zone="menu"] button')?.focus()
}
