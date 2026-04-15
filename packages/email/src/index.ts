import { MAGIC_LINK_HTML } from './templates/__generated__/magic-link.js'

export { MagicLinkEmail } from './templates/magic-link.js'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function renderMagicLinkEmail(props: {
  url: string
  appName?: string
  appUrl?: string
}) {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const html = MAGIC_LINK_HTML.replaceAll('__MAGIC_LINK_URL__', escapeHtml(props.url))
    .replaceAll('__APP_NAME__', escapeHtml(appName))
    .replaceAll('__APP_URL__', escapeHtml(appUrl))
  return { html, text: htmlToPlainText(html) }
}
