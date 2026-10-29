import { MAGIC_LINK_HTML } from './templates/__generated__/magic-link.js'
import { INVITATION_HTML } from './templates/__generated__/invitation.js'
import { INVITE_REQUEST_HTML } from './templates/__generated__/invite-request.js'

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

/** "Editor in Sales (Project 101)", "a Project admin of Project 101", "an admin" or "a member". */
function placeLine(role: string, place: string | null): string {
  if (place) return place
  return role === 'admin' ? 'an admin' : 'a member'
}

export async function renderInvitationEmail(props: {
  url: string
  orgName: string
  inviterName: string
  role: string
  /** Where the invite leads first, already worded ("Sales in Project 101 (Editor)"); null for an org-wide role. */
  place: string | null
  expiresAt: string
  appName?: string
  appUrl?: string
}) {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const expires = new Date(props.expiresAt)
  const expiresLine = Number.isNaN(expires.getTime())
    ? 'The link expires in 7 days.'
    : `The link expires on ${expires.toISOString().slice(0, 10)}.`
  const html = INVITATION_HTML.replaceAll('__INVITE_URL__', escapeHtml(props.url))
    .replaceAll('__ORG_NAME__', escapeHtml(props.orgName))
    .replaceAll('__INVITER_NAME__', escapeHtml(props.inviterName))
    .replaceAll('__PLACE_LINE__', escapeHtml(placeLine(props.role, props.place)))
    .replaceAll('__EXPIRES_LINE__', escapeHtml(expiresLine))
    .replaceAll('__APP_NAME__', escapeHtml(appName))
    .replaceAll('__APP_URL__', escapeHtml(appUrl))
  return { html, text: htmlToPlainText(html) }
}

export async function renderInviteRequestEmail(props: {
  url: string
  orgName: string
  askerEmail: string
  appName?: string
  appUrl?: string
}) {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const html = INVITE_REQUEST_HTML.replaceAll('__MEMBERS_URL__', escapeHtml(props.url))
    .replaceAll('__ORG_NAME__', escapeHtml(props.orgName))
    .replaceAll('__ASKER_EMAIL__', escapeHtml(props.askerEmail))
    .replaceAll('__APP_NAME__', escapeHtml(appName))
    .replaceAll('__APP_URL__', escapeHtml(appUrl))
  return { html, text: htmlToPlainText(html) }
}
