// The Inbox (B8): what reaches a person, how each notification reads, and
// where its link goes. A row stores its event and the facts at the time;
// the sentence is written when the Inbox is read, since a folded failure's
// count changes after the row exists. Places are named as they are now.

import { stripUnsafeText } from './audit.js'

/** Sets the row's icon and tint. */
export type NotificationKind = 'failure' | 'request' | 'expiry' | 'people' | 'deploy'

/**
 * Facts a notification was written with. Names are snapshots: a person who
 * leaves still reads as who they were.
 */
export interface NotificationMeta {
  /** The person who acted: the asker, the decider, the one who deployed. */
  person?: string
  /** An invited address. */
  email?: string
  /** The workspace's name when it happened, for when it is gone. */
  workspace?: string
  workflow?: string
  /** The step a run failed at. */
  step?: string
  version?: number
  /** An API key's name. */
  name?: string
  /** When an API key expires (ISO). */
  expiresAt?: string
  /** An approval that granted nothing (`access_request.approve`): they could already edit. */
  alreadyEditing?: boolean
}

/** Where a notification's link goes, by slug; the web turns it into a path. */
export type NotificationTarget =
  | { kind: 'workspace'; project: string; workspace: string; page: 'workflows' | 'runs' }
  | { kind: 'workspace-settings'; project: string; workspace: string; tab: 'keys' }
  | { kind: 'project-settings'; project: string; page: 'api-keys' | 'shared' }
  | { kind: 'org-settings'; page: 'members' | 'api-keys' }

/** A notification as the database reads it, before it is put in words. */
export interface NotificationRecord {
  id: string
  event: string
  count: number
  meta: NotificationMeta
  /** When it last happened: a repeat moves it up. */
  at: string
  /** Read, or an edit request already answered. */
  read: boolean
  /** Waiting on the person: an open request, a failure, an expiring key, an ask. */
  needsAction: boolean
  place: {
    level: 'organization' | 'project' | 'workspace'
    orgName: string
    /** Null when the project is gone or no longer the organization's. */
    projectSlug: string | null
    projectName: string | null
    workspaceSlug: string | null
    workspaceName: string | null
  }
  /** The edit request a `request` row is about, as it stands now. */
  request: {
    id: string
    status: 'pending' | 'approved' | 'declined'
    asker: string
    /** Approved when they could already edit: nothing was granted. */
    alreadyEditing: boolean
  } | null
}

export interface InboxNotification {
  id: string
  kind: NotificationKind
  event: string
  title: string
  /** "Project 101 · Sales". */
  where: string
  at: string
  read: boolean
  /** Shown under "Needs action". */
  needsAction: boolean
  /** Repeats folded into the row: a workflow failing 3 times in an hour. */
  count: number
  link?: { label: string; to: NotificationTarget }
  /** An edit-access request someone can approve or decline from the Inbox. */
  request?: {
    id: string
    status: 'pending' | 'approved' | 'declined'
    /** Once decided: "Approved. Daniel is now an Editor in Sales." */
    outcome?: string
  }
}

/** The Inbox's pills, counted over every row the person can see. */
export interface InboxCounts {
  all: number
  unread: number
  action: number
}

export interface InboxPage {
  data: InboxNotification[]
  counts: InboxCounts
}

/** When someone last closed What's new (null: never), and the notes it showed them. */
export interface ReleaseVisit {
  lastVisit: string | null
  /** Note ids already seen: any other note is new to them, whatever its date. */
  seen: string[]
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const NOTIFICATION_RETENTION_DAYS = 30
export const NOTIFICATION_RETENTION_MS = NOTIFICATION_RETENTION_DAYS * DAY_MS
/** Rows the Inbox lists; the counts still cover every row. */
export const INBOX_LIMIT = 100
/** An expiring key is warned about this long before, and again a day before. */
export const KEY_EXPIRY_WARNING_MS = 7 * DAY_MS
export const KEY_EXPIRY_LAST_WARNING_MS = DAY_MS
/** Longest name a notification keeps from what someone typed. */
export const NOTIFICATION_TEXT_MAX = 200

type Place = NotificationRecord['place']

interface NotificationEntry {
  kind: NotificationKind
  /** Whether a new row waits on the person; a request's follows its status. */
  needsAction: boolean
  title: (meta: NotificationMeta, record: NotificationRecord, now: Date) => string
  link?: (place: Place) => { label: string; to: NotificationTarget } | undefined
  /** After the place: "Acme Inc · Members". */
  whereDetail?: string
}

const someone = (name: string | undefined) => name || 'Someone'
const firstName = (name: string) => name.split(' ')[0] || name
const workspaceOf = (meta: NotificationMeta, place: Place) =>
  place.workspaceName ?? meta.workspace ?? 'a workspace'

function workspaceLink(label: string, page: 'workflows' | 'runs') {
  return (place: Place) =>
    place.projectSlug && place.workspaceSlug
      ? {
          label,
          to: {
            kind: 'workspace' as const,
            project: place.projectSlug,
            workspace: place.workspaceSlug,
            page,
          },
        }
      : undefined
}

const membersLink = () => ({
  label: 'See members',
  to: { kind: 'org-settings' as const, page: 'members' as const },
})

/** Where a key is managed: its own level's settings. */
function keyLink(place: Place): { label: string; to: NotificationTarget } | undefined {
  const label = 'Review key'
  if (place.level === 'organization') {
    return { label, to: { kind: 'org-settings', page: 'api-keys' } }
  }
  if (!place.projectSlug) return undefined
  if (place.level === 'project') {
    return { label, to: { kind: 'project-settings', project: place.projectSlug, page: 'api-keys' } }
  }
  if (!place.workspaceSlug) return undefined
  return {
    label,
    to: {
      kind: 'workspace-settings',
      project: place.projectSlug,
      workspace: place.workspaceSlug,
      tab: 'keys',
    },
  }
}

function expiresIn(expiresAt: string | undefined, now: Date): string {
  const left = expiresAt ? new Date(expiresAt).getTime() - now.getTime() : Number.NaN
  if (Number.isNaN(left)) return 'expires soon'
  if (left <= 0) return 'has expired'
  if (left < DAY_MS) return 'expires in less than a day'
  const days = Math.floor(left / DAY_MS)
  return days === 1 ? 'expires in 1 day' : `expires in ${days} days`
}

function failedTitle(meta: NotificationMeta, record: NotificationRecord): string {
  const times = record.count > 1 ? ` ${record.count} times in the last hour` : ''
  const step = meta.step ? `${times ? ',' : ''} at step “${meta.step}”` : ''
  return `${meta.workflow ?? 'A workflow'} failed${times}${step}`
}

/** Every notification the API sends, by event. */
export const NOTIFICATION_EVENTS = {
  'access_request.create': {
    kind: 'request',
    needsAction: true,
    title: (meta, record) =>
      `${someone(meta.person)} asked for edit access to ${workspaceOf(meta, record.place)}`,
  },
  'access_request.approve': {
    kind: 'people',
    needsAction: false,
    title: (meta, record) =>
      meta.alreadyEditing
        ? `${someone(meta.person)} approved your request for edit access to ${workspaceOf(meta, record.place)}`
        : `${someone(meta.person)} gave you edit access to ${workspaceOf(meta, record.place)}`,
    link: workspaceLink('Open', 'workflows'),
  },
  'access_request.decline': {
    kind: 'people',
    needsAction: false,
    title: (meta, record) =>
      `${someone(meta.person)} declined your request for edit access to ${workspaceOf(meta, record.place)}`,
  },
  'invitation.accept': {
    kind: 'people',
    needsAction: false,
    title: (meta) => `${meta.email ?? 'Someone'} accepted your invite`,
    link: membersLink,
    whereDetail: 'Members',
  },
  'invitation.decline': {
    kind: 'people',
    needsAction: false,
    title: (meta, record) =>
      `${someone(meta.person || meta.email)} declined your invite to ${record.place.orgName}`,
    link: membersLink,
    whereDetail: 'Members',
  },
  'invitation.ask_again': {
    kind: 'people',
    needsAction: true,
    title: (meta, record) =>
      `${meta.email ?? 'Someone'} asked for a new invite to ${record.place.orgName}`,
    link: membersLink,
    whereDetail: 'Members',
  },
  'run.failed': {
    kind: 'failure',
    needsAction: true,
    title: failedTitle,
    link: workspaceLink('See runs', 'runs'),
  },
  'api_key.expiring': {
    kind: 'expiry',
    needsAction: true,
    title: (meta, _record, now) =>
      `API key “${meta.name ?? 'Unnamed'}” ${expiresIn(meta.expiresAt, now)}`,
    link: keyLink,
  },
  'workflow.deploy.shared': {
    kind: 'deploy',
    needsAction: false,
    // Deploys of one workflow fold into one row an hour, so a loop of them can't bury the rest.
    title: (meta, record) => {
      const workflow = meta.workflow ?? 'a workflow'
      const version = meta.version !== undefined ? ` v${meta.version}` : ''
      return record.count > 1
        ? `${someone(meta.person)} deployed ${workflow} ${record.count} times in the last hour (latest${version || ' version'}), shared with every workspace`
        : `${someone(meta.person)} deployed ${workflow}${version}, shared with every workspace`
    },
    // Filed at the project: its readers admin other workspaces, not this one.
    link: (place) =>
      place.projectSlug
        ? {
            label: 'See shared',
            to: { kind: 'project-settings', project: place.projectSlug, page: 'shared' },
          }
        : undefined,
  },
} satisfies Record<string, NotificationEntry>

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS

export function isNotificationEvent(event: string): event is NotificationEvent {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, event)
}

/** How a new row of `event` is stored: its kind, and whether it waits on the person. */
export function notificationKindOf(event: NotificationEvent): {
  kind: NotificationKind
  needsAction: boolean
} {
  const entry: NotificationEntry = NOTIFICATION_EVENTS[event]
  return { kind: entry.kind, needsAction: entry.needsAction }
}

/** The place in words, with what is gone said so. */
function whereOf(place: Place, detail: string | undefined): string {
  const project = place.projectName ?? 'Deleted project'
  const base =
    place.level === 'organization'
      ? place.orgName
      : place.level === 'project'
        ? project
        : `${project} · ${place.workspaceName ?? 'Deleted workspace'}`
  return detail ? `${base} · ${detail}` : base
}

function outcomeOf(
  request: NonNullable<NotificationRecord['request']>,
  meta: NotificationMeta,
  place: Place,
) {
  const asker = firstName(request.asker) || 'They'
  const workspace = workspaceOf(meta, place)
  if (request.status === 'declined') return `Declined. ${asker} was told.`
  if (request.status !== 'approved') return undefined
  return request.alreadyEditing
    ? `Approved. ${asker} could already edit in ${workspace}.`
    : `Approved. ${asker} is now an Editor in ${workspace}.`
}

/**
 * A stored notification in words. An event this build doesn't know (a row
 * written by a newer one) reads as a plain "Something happened" rather than
 * failing the Inbox.
 */
export function renderNotification(record: NotificationRecord, now: Date): InboxNotification {
  const entry: NotificationEntry | undefined = isNotificationEvent(record.event)
    ? NOTIFICATION_EVENTS[record.event]
    : undefined
  const link = entry?.link?.(record.place)
  const request = record.request
  return {
    id: record.id,
    kind: entry?.kind ?? 'people',
    event: record.event,
    title: entry ? entry.title(record.meta, record, now) : 'Something happened',
    where: whereOf(record.place, entry?.whereDetail),
    at: record.at,
    read: record.read,
    needsAction: record.needsAction,
    count: record.count,
    ...(link && { link }),
    ...(request && {
      request: {
        id: request.id,
        status: request.status,
        ...(request.status !== 'pending' && {
          outcome: outcomeOf(request, record.meta, record.place),
        }),
      },
    }),
  }
}

/** A name or address someone typed, as a notification keeps it. */
export function notificationText(text: string): string {
  return stripUnsafeText(text).slice(0, NOTIFICATION_TEXT_MAX)
}

/** Failures of one workflow fold into one row per clock hour. */
export function runFailureGroupKey(workflowId: string, at: Date): string {
  return `run.failed:${workflowId}:${at.toISOString().slice(0, 13)}`
}

/** Deploys of one shared workflow fold into one row per clock hour. */
export function sharedDeployGroupKey(workflowId: string, at: Date): string {
  return `workflow.deploy.shared:${workflowId}:${at.toISOString().slice(0, 13)}`
}
