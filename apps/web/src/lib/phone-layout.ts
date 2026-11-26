/** Tailwind's `md`: below it the dashboard is the phone layout, with a tab bar and full-screen overlays. */
export const PHONE_LAYOUT_BELOW_PX = 768

type MediaWindow = Partial<Pick<Window, 'matchMedia'>>

/** Whether the window shows the phone layout; never on the server, or where media queries aren't read. */
export function isPhoneLayout(
  win: MediaWindow | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  if (typeof win?.matchMedia !== 'function') return false
  return !win.matchMedia(`(min-width: ${PHONE_LAYOUT_BELOW_PX}px)`).matches
}
