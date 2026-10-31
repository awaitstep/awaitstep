/** Palette from the canvas email boards (`EmailSystem`); light is the base, dark overrides it by class. */
export const LIGHT = {
  brand: '#23BA7D',
  onBrand: '#04120C',
  page: '#FFFFFF',
  text: '#14161A',
  muted: '#4C535E',
  faint: '#787F8A',
  line: '#E7E9EC',
  line2: '#CDD2D8',
  link: '#0B7A51',
  ok: '#0B7A51',
  danger: '#B42329',
  rail: '#F0F2F4',
} as const

export const DARK = {
  page: '#0D0E11',
  text: '#ECEDEE',
  muted: '#A2A8B0',
  faint: '#7E848D',
  line: '#22252A',
  line2: '#343841',
  link: '#7BE0B5',
  ok: '#7BE0B5',
  danger: '#F2878A',
  rail: '#1C1F24',
} as const

export const FONT = "Outfit, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Where the footer links lead. The pages behind Docs, Status, Support and Notification settings are planned in plan/email-footer-pages.md. */
export const FOOTER_LINKS = {
  docs: 'https://docs.awaitstep.dev',
  status: 'https://awaitstep.dev/status',
  support: 'https://awaitstep.dev/support',
  quickstart: 'https://docs.awaitstep.dev',
  notificationsPath: '/settings/notifications',
} as const

/** Dark overrides, keyed by the `ae-*` classes the layout and fragments carry. Clients that drop `<style>` keep the light inline colors. */
export const DARK_CSS = `
@media (prefers-color-scheme: dark) {
  .ae-page { background: ${DARK.page} !important; color: ${DARK.text} !important; }
  .ae-text { color: ${DARK.text} !important; }
  .ae-muted { color: ${DARK.muted} !important; }
  .ae-faint { color: ${DARK.faint} !important; }
  .ae-link { color: ${DARK.link} !important; }
  .ae-ok { color: ${DARK.ok} !important; }
  .ae-danger { color: ${DARK.danger} !important; }
  .ae-okbg { background-color: ${DARK.ok} !important; }
  .ae-dangerbg { background-color: ${DARK.danger} !important; }
  .ae-rail { background-color: ${DARK.rail} !important; color: ${DARK.muted} !important; }
  .ae-line { border-color: ${DARK.line} !important; }
  .ae-sep { color: ${DARK.line2} !important; }
}
`

/** Inline `style="…"` text for the HTML fragments built outside React. */
export function styleAttr(style: Record<string, string | number>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(';')
}
