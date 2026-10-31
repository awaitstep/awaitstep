import { MAGIC_LINK_HTML } from './templates/__generated__/magic-link.js'
import { INVITATION_HTML } from './templates/__generated__/invitation.js'
import { INVITE_REQUEST_HTML } from './templates/__generated__/invite-request.js'
import { ACCESS_REQUEST_HTML } from './templates/__generated__/access-request.js'
import { RUN_FAILED_HTML } from './templates/__generated__/run-failed.js'
import { RUN_RECOVERED_HTML } from './templates/__generated__/run-recovered.js'
import { KEY_EXPIRING_HTML } from './templates/__generated__/key-expiring.js'
import { NEW_SIGN_IN_HTML } from './templates/__generated__/new-sign-in.js'
import { WELCOME_HTML } from './templates/__generated__/welcome.js'
import {
  UNSAFE_TEXT,
  detailRows,
  escapeHtml,
  formatClock,
  formatDay,
  formatWhen,
  inline,
  link,
  safeHref,
  short,
  runsStrip,
  strong,
  type DetailRow,
} from './fragments.js'

export { formatDay, formatWhen } from './fragments.js'

/** Where links point when the caller names no web origin. */
const DEFAULT_APP_URL = 'https://awaitstep.dev'

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
 * A token ending `_HTML__` takes markup the renderer built from escaped
 * parts (`detailRows`, `esc`) and is placed as it is.
 */
function fill(template: string, values: Record<string, string>): string {
  const all: Record<string, string> = { __YEAR__: String(new Date().getFullYear()), ...values }
  // Without a web origin the logo and settings links fall back to the public site rather than a relative path.
  if ('__APP_URL__' in all)
    all['__APP_URL__'] = all['__APP_URL__']!.replace(/\/+$/, '') || DEFAULT_APP_URL
  return template.replace(/__[A-Z_]+__/g, (token) => {
    if (!Object.prototype.hasOwnProperty.call(all, token)) return token
    const value = all[token]!
    if (token.endsWith('_HTML__')) return value
    return escapeHtml(token.endsWith('_URL__') ? safeHref(value) : inline(value))
  })
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<(style|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div><\/div>/gi, '')
    .replace(/<td[^>]*class="ae-rail"[^>]*>[\s\S]*?<\/td>/gi, '')
    .replace(
      /<a\s[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) =>
        label.replace(/<[^>]+>/g, '') === href ? label : `${label} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<\/(a|span)>(?=<)/gi, '</$1> ')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** What every render returns: the two bodies and the subject the board shows. */
export interface RenderedEmail {
  html: string
  text: string
  subject: string
}

function rendered(rawHtml: string, subject: string): RenderedEmail {
  // A paragraph left empty by an optional line (a note with nothing to say) takes no space.
  const html = rawHtml.replace(/<p\b[^>]*><\/p>/g, '')
  return { html, text: htmlToPlainText(html), subject: subjectText(subject) }
}

/** "Sent to a@b.test because …", or "Sent because …" when the address isn't known. */
function sentTo(to: string | undefined, reason: string): string {
  return `${to ? `Sent to ${to}` : 'Sent'} because ${reason}`
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

function initials(name: string): string {
  const letters = inline(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toUpperCase())
  return letters.join('') || '?'
}

const ROLE_HINTS: Record<string, string> = {
  viewer: 'see workflows and runs',
  editor: 'build, run and deploy workflows',
}

function roleRow(label: string, role: string): DetailRow {
  const hint = ROLE_HINTS[role.toLowerCase()]
  return { label, value: capitalize(role), sub: hint ? `· ${hint}` : undefined }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** T1 — the sign-in link. */
export async function renderMagicLinkEmail(props: {
  url: string
  /** The address signing in, shown in the lead and the footer. */
  to?: string
  /** "Chrome on macOS". */
  device?: string
  /** "Amsterdam, NL"; the mail adds "(approximate)". */
  near?: string
  requestedAt?: string
  /** IANA zone the time is written in; UTC when left out. */
  timeZone?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const when = props.requestedAt ? formatWhen(props.requestedAt, props.timeZone) : null
  const rows: DetailRow[] = []
  if (props.device) rows.push({ label: 'Requested from', value: short(props.device) })
  if (props.near) rows.push({ label: 'Near', value: `${short(props.near)} (approximate)` })
  if (when) rows.push({ label: 'When', value: when })
  const asLine = props.to ? ` as ${strong(props.to)}` : ''
  const html = fill(MAGIC_LINK_HTML, {
    __MAGIC_LINK_URL__: props.url,
    __LEAD_HTML__: `Use the button below to sign in${asLine}. The link works once and expires in 5 minutes.`,
    __ROWS_HTML__: detailRows(rows),
    __FOOTER_NOTE__: sentTo(
      props.to,
      'someone asked to sign in with this address. You can’t turn off security emails.',
    ),
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return rendered(html, `Sign in to ${appName}`)
}

/** "Editor in Sales (Project 101)", "a Project admin of Project 101", "an admin" or "a member". */
function placeLine(role: string, place: string | null): string {
  if (place) return place
  return role === 'admin' ? 'an admin' : 'a member'
}

/** T2 — an admin invited this address to an organization. */
export async function renderInvitationEmail(props: {
  url: string
  orgName: string
  inviterName: string
  role: string
  /** Where the invite leads first, already worded ("Sales in Project 101 (Editor)"); null for an org-wide role. */
  place: string | null
  expiresAt: string
  /** The invited address. */
  to?: string
  /** With `projectName`, written as its own row; otherwise `place` is. */
  workspaceName?: string
  projectName?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const day = formatDay(props.expiresAt)
  const expires = day ? `This invite expires on ${day}.` : 'This invite expires in 7 days.'
  const rows: DetailRow[] = [{ label: 'Organization', value: props.orgName }]
  if (props.workspaceName && props.projectName) {
    rows.push({ label: 'Workspace', value: props.workspaceName, sub: `in ${props.projectName}` })
  } else if (props.place) {
    rows.push({ label: 'Where', value: props.place })
  }
  // `place` already names the role it grants ("Sales in Project 101 (Editor)"), so the org-level role would contradict it.
  if (!props.place || props.workspaceName) rows.push(roleRow('Your role', props.role))
  if (props.to) rows.push({ label: 'Invited email', value: props.to })
  const scope =
    props.place || props.workspaceName
      ? `You won’t see other projects or workspaces in ${props.orgName} unless someone adds you. `
      : ''
  const html = fill(INVITATION_HTML, {
    __INVITE_URL__: props.url,
    __ORG_NAME__: props.orgName,
    __INVITER_NAME__: props.inviterName,
    __INVITER_INITIALS__: initials(props.inviterName),
    __ROWS_HTML__: detailRows(rows),
    __PREVIEW_LINE__: `You’ll join ${props.place ?? placeLine(props.role, null)}. ${expires}`,
    __NOTE_LINE__: `${scope}${expires}${props.to ? ` Sign in with ${props.to} to accept it.` : ''}`,
    __FOOTER_NOTE__: sentTo(
      props.to,
      `${props.inviterName} invited this address to ${props.orgName}.`,
    ),
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return rendered(html, `${props.inviterName} invited you to ${props.orgName} on ${appName}`)
}

/** To an inviter: someone whose invite expired asked for a new one. */
export async function renderInviteRequestEmail(props: {
  url: string
  orgName: string
  askerEmail: string
  to?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const html = fill(INVITE_REQUEST_HTML, {
    __MEMBERS_URL__: props.url,
    __ORG_NAME__: props.orgName,
    __ASKER_EMAIL__: props.askerEmail,
    __FOOTER_NOTE__: sentTo(props.to, `you invited people to ${props.orgName}.`),
    __APP_NAME__: appName,
    __APP_URL__: appUrl,
  })
  return rendered(html, `${props.askerEmail} asked for a new invite to ${props.orgName}`)
}

/** T3 — someone asked a workspace manager for access. */
export async function renderAccessRequestEmail(props: {
  /** Where the request waits, the Inbox. Approve and Decline lead here unless given their own. */
  url: string
  askerName: string
  workspaceName: string
  projectName: string
  /** `join` for someone who can't open the workspace, `edit` for a Viewer asking to edit. */
  kind?: 'join' | 'edit'
  askerEmail?: string
  /** The role asked for, "Viewer". */
  requestedRole?: string
  message?: string | null
  approveUrl?: string
  declineUrl?: string
  /** "Edit access instead" leads here when given. */
  editUrl?: string
  to?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appUrl = props.appUrl ?? ''
  const join = (props.kind ?? 'join') === 'join'
  const rows: DetailRow[] = [
    {
      label: 'Person',
      value: props.askerName,
      sub: props.askerEmail ? `· ${props.askerEmail}` : undefined,
    },
    {
      label: 'Workspace',
      value: props.workspaceName,
      sub: props.projectName ? `in ${props.projectName}` : undefined,
    },
  ]
  if (props.requestedRole) rows.push(roleRow('Role asked for', props.requestedRole))
  if (props.message) rows.push({ label: 'Message', value: `“${props.message}”` })
  const where = props.projectName
    ? `${props.workspaceName} in ${props.projectName}`
    : props.workspaceName
  const access = props.requestedRole
    ? `${capitalize(props.requestedRole)} access`
    : join
      ? 'Access'
      : 'Edit access'
  const decide =
    props.approveUrl || props.declineUrl
      ? 'Approve or decline from this email.'
      : 'Open your Inbox to approve or decline.'
  const headline = join
    ? `${props.askerName} is asking to join ${props.workspaceName}`
    : `${props.askerName} is asking for edit access to ${props.workspaceName}`
  const html = fill(ACCESS_REQUEST_HTML, {
    __APPROVE_URL__: props.approveUrl ?? props.url,
    __DECLINE_URL__: props.declineUrl ?? props.url,
    __HEADLINE__: headline,
    __LEAD_LINE__: join
      ? `${props.askerName} can’t open this workspace yet. Nothing changes until you decide.`
      : `${props.askerName} can view this workspace today. Nothing changes until you decide.`,
    __ROWS_HTML__: detailRows(rows),
    __NOTE_HTML__: props.editUrl
      ? `Want to give a different role? ${link(props.editUrl, 'Edit access instead')}`
      : '',
    __PREVIEW_LINE__: `${access} to ${where}. ${decide}`,
    __FOOTER_NOTE__: sentTo(props.to, `you can manage who joins ${props.workspaceName}.`),
    __APP_URL__: appUrl,
  })
  return rendered(
    html,
    join
      ? `${props.askerName} asked to join ${props.workspaceName}`
      : `${props.askerName} asked for edit access to ${props.workspaceName}`,
  )
}

/** T4 — a workflow keeps failing at one step, or has recovered. */
export async function renderRunFailedEmail(props: {
  url: string
  workflowName: string
  /** The step it failed at, when known. */
  stepName: string | null
  /** "Project 101 · Sales". */
  placeName: string
  /** The project and workspace names on their own; given, `placeName` is not split to find them. */
  projectName?: string
  workspaceName?: string
  /** `recovered` for the one mail sent when runs pass again. */
  state?: 'failing' | 'recovered'
  /** How many of the recent runs failed, "3" of "4". */
  failedRuns?: number
  recentRuns?: number
  /** The last runs, oldest first; `true` is a failed run. */
  runHistory?: boolean[]
  errorMessage?: string | null
  /** "5 minutes ago". */
  lastFailure?: string | null
  /** The workflow's own page. */
  workflowUrl?: string
  to?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const appUrl = props.appUrl ?? ''
  const recovered = props.state === 'recovered'
  const stepLine = props.stepName ? `at step “${props.stepName}”` : 'before finishing'
  const counted = props.failedRuns !== undefined && props.recentRuns !== undefined
  const stoppedAt = props.stepName ? 'at the same step' : 'before finishing'
  const leadLine = recovered
    ? `Runs of ${props.workflowName} in ${props.placeName} are passing again.`
    : counted
      ? props.failedRuns === props.recentRuns
        ? `The last ${props.recentRuns === 1 ? 'run' : `${props.recentRuns} runs`} stopped ${stoppedAt}. Runs that start from now on will hit it too until it’s fixed.`
        : `${props.failedRuns} of the last ${plural(props.recentRuns!, 'run')} stopped ${stoppedAt}. Runs that start from now on will hit it too until it’s fixed.`
      : `A run of ${props.workflowName} in ${props.placeName} failed ${stepLine}. Its runs in ${appName} show the error.`
  const [splitProject, splitWorkspace] = props.placeName.split(' · ')
  const project = props.projectName ?? (props.workspaceName ? undefined : splitProject)
  const workspace = props.workspaceName ?? (props.projectName ? undefined : splitWorkspace)
  const rows: DetailRow[] = [{ label: 'Workflow', value: props.workflowName }]
  rows.push(
    workspace
      ? { label: 'Workspace', value: workspace, sub: project ? `in ${project}` : undefined }
      : { label: 'Workspace', value: props.placeName },
  )
  if (props.stepName && !recovered) rows.push({ label: 'Failing step', value: props.stepName })
  if (!recovered && props.errorMessage) {
    rows.push({ label: 'Error', value: props.errorMessage, mono: true })
  }
  if (!recovered && props.lastFailure)
    rows.push({ label: 'Last failure', value: props.lastFailure })
  const subject = recovered
    ? `${props.workflowName} recovered`
    : counted
      ? `${props.workflowName} failed ${plural(props.failedRuns!, 'time')} in the last hour`
      : `${props.workflowName} failed`
  const html = fill(recovered ? RUN_RECOVERED_HTML : RUN_FAILED_HTML, {
    __RUNS_URL__: props.url,
    __HEADLINE__: recovered
      ? `${props.workflowName} recovered`
      : `${props.workflowName} is failing`,
    __STATUS_LABEL__: recovered ? 'Recovered' : 'Failing',
    __LEAD_LINE__: leadLine,
    __RUNS_HTML__: props.runHistory ? runsStrip(props.runHistory) : '',
    __ROWS_HTML__: detailRows(rows),
    __OPEN_WORKFLOW_HTML__: props.workflowUrl ? link(props.workflowUrl, 'Open workflow') : '',
    __NOTE_LINE__: recovered
      ? 'This is the only email about this recovery.'
      : 'You’ll get one email per hour at most while it keeps failing, and one when it recovers.',
    __PREVIEW_LINE__:
      props.errorMessage && !recovered
        ? `${props.stepName ? `Step “${props.stepName}” ` : ''}${props.errorMessage} · ${props.placeName}`
        : `${props.workflowName} · ${props.placeName}`,
    __FOOTER_NOTE__: sentTo(
      props.to,
      `you get failure alerts for ${workspace ?? props.placeName}.`,
    ),
    __APP_URL__: appUrl,
  })
  return rendered(html, subject)
}

/** T5 — an API key or token is about to stop working. */
export async function renderKeyExpiringEmail(props: {
  /** Where a replacement is created. */
  url: string
  keyName: string
  /** How many days remain: 7, 3 or 1. */
  daysLeft: number
  expiresAt: string
  /** "as_live_8f3k…". */
  keyPrefix?: string
  /** "Project 101 · read only". */
  reaches?: string
  /** "2 hours ago"; leave out when it was never used. */
  lastUsed?: string | null
  /** The key's own page. */
  reviewUrl?: string
  /** What the recipient manages keys for, "Project 101". */
  levelName?: string
  to?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const day = formatDay(props.expiresAt)
  const clock = formatClock(props.expiresAt)
  const rows: DetailRow[] = [{ label: 'Key', value: props.keyName }]
  if (props.keyPrefix) rows.push({ label: 'Starts with', value: props.keyPrefix, mono: true })
  if (props.reaches) {
    const [what, ...rest] = props.reaches.split(' · ')
    rows.push({
      label: 'Reaches',
      value: what!,
      sub: rest.length ? `· ${rest.join(' · ')}` : undefined,
    })
  }
  rows.push({ label: 'Last used', value: props.lastUsed || 'Never' })
  const left = plural(Math.max(1, Math.round(props.daysLeft)), 'day')
  const from = day ? `from ${day}${clock ? ` at ${clock}` : ''}` : 'soon'
  const html = fill(KEY_EXPIRING_HTML, {
    __CREATE_URL__: props.url,
    __STATUS_LABEL__: day ? `Expires ${day}` : `Expires in ${left}`,
    __HEADLINE__: `Your API key expires in ${left}`,
    __LEAD_LINE__: `Requests that use this key will be rejected ${from}. Create a replacement and update where the old key is used.`,
    __ROWS_HTML__: detailRows(rows),
    __REVIEW_HTML__: props.reviewUrl ? link(props.reviewUrl, 'Review key') : '',
    __PREVIEW_LINE__: `Requests that use it stop working${day ? ` on ${day}` : ''}. Create a replacement first.`,
    __FOOTER_NOTE__: sentTo(
      props.to,
      props.levelName ? `you manage API keys in ${props.levelName}.` : 'you manage API keys.',
    ),
    __APP_URL__: props.appUrl ?? '',
  })
  return rendered(html, `API key “${props.keyName}” expires in ${left}`)
}

/** T6 — a sign-in from a device the account hasn't used before. */
export async function renderNewSignInEmail(props: {
  /** The account's sessions page. */
  url: string
  /** "Chrome on Windows 11". */
  device: string
  signedInAt: string
  /** "Rotterdam, NL"; the mail adds "(approximate)". */
  near?: string
  /** "GitHub", "Email link". */
  method?: string
  timeZone?: string
  to?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const when = formatWhen(props.signedInAt, props.timeZone)
  const rows: DetailRow[] = [{ label: 'Device', value: short(props.device) }]
  if (props.near) rows.push({ label: 'Near', value: `${short(props.near)} (approximate)` })
  if (when) rows.push({ label: 'When', value: when })
  if (props.method) rows.push({ label: 'Signed in with', value: short(props.method) })
  const html = fill(NEW_SIGN_IN_HTML, {
    __SESSIONS_URL__: props.url,
    __ROWS_HTML__: detailRows(rows),
    __PREVIEW_LINE__: `${[props.near, when].filter(Boolean).join(' · ')}${props.near || when ? '. ' : ''}Not you? Sign that device out.`,
    __FOOTER_NOTE__: `${props.to ? `Sent to ${props.to}` : 'Sent'} to keep your account safe. You can’t turn off security emails.`,
    __APP_URL__: props.appUrl ?? '',
  })
  return rendered(html, `New sign-in to ${appName} from ${short(props.device)}`)
}

/** T7 — the first sign-in to a new account. */
export async function renderWelcomeEmail(props: {
  /** First name, as they gave it. */
  name: string
  /** The organization they landed in. */
  orgName?: string
  connectUrl: string
  templatesUrl: string
  /** Where "Open AwaitStep" leads. */
  openUrl: string
  to?: string
  appName?: string
  appUrl?: string
}): Promise<RenderedEmail> {
  const appName = props.appName ?? 'AwaitStep'
  const name = inline(props.name).trim()
  const where = props.orgName ? `You’re in ${strong(props.orgName)}.` : 'You’re in.'
  const html = fill(WELCOME_HTML, {
    __HEADLINE__: name ? `Welcome, ${name}` : 'Welcome',
    __LEAD_HTML__: `${where} Here’s the quickest path to a workflow running on your own Cloudflare account.`,
    __CONNECT_URL__: props.connectUrl,
    __TEMPLATES_URL__: props.templatesUrl,
    __OPEN_URL__: props.openUrl,
    __FOOTER_NOTE__: sentTo(props.to, `you created your ${appName} account.`),
    __APP_NAME__: appName,
    __APP_URL__: props.appUrl ?? '',
  })
  return rendered(html, name ? `Welcome to ${appName}, ${name}` : `Welcome to ${appName}`)
}
