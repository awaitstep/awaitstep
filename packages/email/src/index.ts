import { MAGIC_LINK_HTML } from './templates/__generated__/magic-link.js'
import { INVITATION_HTML } from './templates/__generated__/invitation.js'
import { INVITE_REQUEST_HTML } from './templates/__generated__/invite-request.js'
import { ACCESS_REQUEST_HTML } from './templates/__generated__/access-request.js'
import { RUN_FAILED_HTML } from './templates/__generated__/run-failed.js'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Controls (CR/LF included) and direction overrides: never in a name a mail shows.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** Longest a typed value may run in a subject line. */
const SUBJECT_TEXT_MAX = 200

/**
 * Text someone typed, fit for a subject line: no controls or direction
 * overrides (a CR/LF or RLO from a name never reaches a header), capped.
 */
export function subjectText(text: string): string {
  return text.replace(UNSAFE_TEXT, '').slice(0, SUBJECT_TEXT_MAX)
}

/**
 * The template with each `__TOKEN__` replaced by its value, cleaned of
 * controls and direction overrides and HTML-escaped, in
 * one pass: a value is never read again, so a name holding `__APP_URL__`
 * stays as typed, and a replacement given as a function is taken literally
 * (a string one would read `$&`, `` $` `` and `$'` in a name as patterns).
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/__[A-Z_]+__/g, (token) =>
    Object.prototype.hasOwnProperty.call(values, token)
      ? escapeHtml(values[token]!.replace(UNSAFE_TEXT, ''))
      : token,
  )
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
  const html = fill(MAGIC_LINK_HTML, {
    __MAGIC_LINK_URL__: props.url,
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
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
  const html = fill(INVITATION_HTML, {
    __INVITE_URL__: props.url,
    __ORG_NAME__: props.orgName,
    __INVITER_NAME__: props.inviterName,
    __PLACE_LINE__: placeLine(props.role, props.place),
    __EXPIRES_LINE__: expiresLine,
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
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
  const html = fill(INVITE_REQUEST_HTML, {
    __MEMBERS_URL__: props.url,
    __ORG_NAME__: props.orgName,
    __ASKER_EMAIL__: props.askerEmail,
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return { html, text: htmlToPlainText(html) }
}

export async function renderAccessRequestEmail(props: {
  url: string
  askerName: string
  workspaceName: string
  projectName: string
  appName?: string
  appUrl?: string
}) {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const html = fill(ACCESS_REQUEST_HTML, {
    __INBOX_URL__: props.url,
    __ASKER_NAME__: props.askerName,
    __WORKSPACE_NAME__: props.workspaceName,
    __PROJECT_NAME__: props.projectName,
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return { html, text: htmlToPlainText(html) }
}

export async function renderRunFailedEmail(props: {
  url: string
  workflowName: string
  /** The step it failed at, when known. */
  stepName: string | null
  /** "Project 101 · Sales". */
  placeName: string
  appName?: string
  appUrl?: string
}) {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const stepLine = props.stepName ? `at step “${props.stepName}”` : 'before finishing'
  const html = fill(RUN_FAILED_HTML, {
    __RUNS_URL__: props.url,
    __WORKFLOW_NAME__: props.workflowName,
    __STEP_LINE__: stepLine,
    __PLACE_NAME__: props.placeName,
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return { html, text: htmlToPlainText(html) }
}
