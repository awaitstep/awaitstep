import { render, toPlainText } from '@react-email/components'
import { MagicLinkEmail } from './templates/magic-link.js'

export { MagicLinkEmail } from './templates/magic-link.js'

export async function renderMagicLinkEmail(props: {
  url: string
  appName?: string
  appUrl?: string
}) {
  const html = await render(MagicLinkEmail(props))
  const text = toPlainText(html)
  return { html, text }
}
