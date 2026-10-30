import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_EVENTS,
  isNotificationEvent,
  notificationKindOf,
  notificationText,
  renderNotification,
  runFailureGroupKey,
  type NotificationEvent,
  type NotificationRecord,
} from '../inbox.js'

const NOW = new Date('2026-10-30T12:00:00.000Z')

const IN_SALES: NotificationRecord['place'] = {
  level: 'workspace',
  orgName: 'Acme Inc',
  projectSlug: 'project-101',
  projectName: 'Project 101',
  workspaceSlug: 'sales',
  workspaceName: 'Sales',
}

const IN_ORG: NotificationRecord['place'] = {
  level: 'organization',
  orgName: 'Acme Inc',
  projectSlug: null,
  projectName: null,
  workspaceSlug: null,
  workspaceName: null,
}

function record(overrides: Partial<NotificationRecord>): NotificationRecord {
  return {
    id: 'ntf_1',
    event: 'run.failed',
    count: 1,
    meta: {},
    at: NOW.toISOString(),
    read: false,
    needsAction: true,
    place: IN_SALES,
    request: null,
    ...overrides,
  }
}

describe('renderNotification', () => {
  it('reads a folded failure as the board does, with the step and a runs link', () => {
    const rendered = renderNotification(
      record({ count: 3, meta: { workflow: 'Lead enrichment', step: 'Fetch company' } }),
      NOW,
    )
    expect(rendered).toMatchObject({
      kind: 'failure',
      title: 'Lead enrichment failed 3 times in the last hour, at step “Fetch company”',
      where: 'Project 101 · Sales',
      count: 3,
      link: {
        label: 'See runs',
        to: { kind: 'workspace', project: 'project-101', workspace: 'sales', page: 'runs' },
      },
    })
  })

  it('reads a single failure without a count, and without a step when none is known', () => {
    expect(
      renderNotification(record({ meta: { workflow: 'Sync', step: 'Fetch' } }), NOW).title,
    ).toBe('Sync failed at step “Fetch”')
    expect(renderNotification(record({ meta: { workflow: 'Sync' } }), NOW).title).toBe(
      'Sync failed',
    )
    expect(renderNotification(record({ count: 2, meta: { workflow: 'Sync' } }), NOW).title).toBe(
      'Sync failed 2 times in the last hour',
    )
  })

  it('names a place that is gone and drops its link', () => {
    const rendered = renderNotification(
      record({
        meta: { workflow: 'Sync' },
        place: {
          ...IN_SALES,
          projectSlug: null,
          projectName: null,
          workspaceSlug: null,
          workspaceName: null,
        },
      }),
      NOW,
    )
    expect(rendered.where).toBe('Deleted project · Deleted workspace')
    expect(rendered.link).toBeUndefined()
  })

  it('reads an open edit request with its asker and no outcome', () => {
    const rendered = renderNotification(
      record({
        event: 'access_request.create',
        meta: { person: 'Priya Shah', workspace: 'Sales' },
        request: { id: 'req_1', status: 'pending', asker: 'Priya Shah', alreadyEditing: false },
      }),
      NOW,
    )
    expect(rendered).toMatchObject({
      kind: 'request',
      title: 'Priya Shah asked for edit access to Sales',
      where: 'Project 101 · Sales',
      request: { id: 'req_1', status: 'pending' },
    })
    expect(rendered.request?.outcome).toBeUndefined()
    expect(rendered.link).toBeUndefined()
  })

  it('gives an answered request the outcome line the board shows', () => {
    const answered = (status: 'approved' | 'declined', alreadyEditing?: boolean) =>
      renderNotification(
        record({
          event: 'access_request.create',
          meta: { person: 'Priya Shah' },
          request: {
            id: 'req_1',
            status,
            asker: 'Priya Shah',
            alreadyEditing: alreadyEditing ?? false,
          },
        }),
        NOW,
      ).request?.outcome
    expect(answered('approved')).toBe('Approved. Priya is now an Editor in Sales.')
    expect(answered('approved', true)).toBe('Approved. Priya could already edit in Sales.')
    expect(answered('declined')).toBe('Declined. Priya was told.')
  })

  it('uses the workspace name it was written with once the workspace is gone', () => {
    const rendered = renderNotification(
      record({
        event: 'access_request.decline',
        meta: { person: 'Ama Mensah', workspace: 'Sales' },
        place: { ...IN_SALES, workspaceSlug: null, workspaceName: null },
      }),
      NOW,
    )
    expect(rendered.title).toBe('Ama Mensah declined your request for edit access to Sales')
  })

  it('tells the asker whether an approval granted anything', () => {
    const approve = (alreadyEditing: boolean) =>
      renderNotification(
        record({ event: 'access_request.approve', meta: { person: 'Ama Mensah', alreadyEditing } }),
        NOW,
      )
    expect(approve(false).title).toBe('Ama Mensah gave you edit access to Sales')
    expect(approve(true).title).toBe('Ama Mensah approved your request for edit access to Sales')
    expect(approve(false).link?.to).toEqual({
      kind: 'workspace',
      project: 'project-101',
      workspace: 'sales',
      page: 'workflows',
    })
  })

  it('reads invite answers in the organization, beside Members', () => {
    const invite = (event: string, meta: NotificationRecord['meta']) =>
      renderNotification(record({ event, meta, place: IN_ORG }), NOW)
    expect(invite('invitation.accept', { email: 'sam@acme.test' })).toMatchObject({
      title: 'sam@acme.test accepted your invite',
      where: 'Acme Inc · Members',
      link: { label: 'See members', to: { kind: 'org-settings', page: 'members' } },
    })
    expect(invite('invitation.decline', { person: 'Daniel Kim', email: 'd@x.test' }).title).toBe(
      'Daniel Kim declined your invite to Acme Inc',
    )
    // A name left empty reads as the address.
    expect(invite('invitation.decline', { person: '', email: 'd@x.test' }).title).toBe(
      'd@x.test declined your invite to Acme Inc',
    )
    expect(invite('invitation.ask_again', { email: 'd@x.test' }).title).toBe(
      'd@x.test asked for a new invite to Acme Inc',
    )
  })

  it('counts down to a key’s expiry and links to where the key lives', () => {
    const key = (expiresAt: string, place: NotificationRecord['place']) =>
      renderNotification(
        record({
          event: 'api_key.expiring',
          meta: { name: 'Read-only dashboard', expiresAt },
          place,
        }),
        NOW,
      )
    expect(key('2026-11-02T13:00:00.000Z', IN_SALES).title).toBe(
      'API key “Read-only dashboard” expires in 3 days',
    )
    expect(key('2026-10-31T13:00:00.000Z', IN_SALES).title).toBe(
      'API key “Read-only dashboard” expires in 1 day',
    )
    expect(key('2026-10-30T18:00:00.000Z', IN_SALES).title).toBe(
      'API key “Read-only dashboard” expires in less than a day',
    )
    expect(key('2026-10-29T18:00:00.000Z', IN_SALES).title).toBe(
      'API key “Read-only dashboard” has expired',
    )
    expect(key('2026-11-02T13:00:00.000Z', IN_SALES).link?.to).toEqual({
      kind: 'workspace-settings',
      project: 'project-101',
      workspace: 'sales',
      tab: 'keys',
    })
    expect(key('2026-11-02T13:00:00.000Z', { ...IN_SALES, level: 'project' }).link?.to).toEqual({
      kind: 'project-settings',
      project: 'project-101',
      page: 'api-keys',
    })
    expect(key('2026-11-02T13:00:00.000Z', IN_ORG).link?.to).toEqual({
      kind: 'org-settings',
      page: 'api-keys',
    })
  })

  it('reads a shared deploy with its version', () => {
    expect(
      renderNotification(
        record({
          event: 'workflow.deploy.shared',
          meta: { person: 'Lena Ortiz', workflow: 'Provision account', version: 7 },
          place: { ...IN_SALES, level: 'project', workspaceSlug: null, workspaceName: null },
        }),
        NOW,
      ),
    ).toMatchObject({
      title: 'Lena Ortiz deployed Provision account v7, shared with every workspace',
      where: 'Project 101',
      link: {
        label: 'See shared',
        to: { kind: 'project-settings', project: 'project-101', page: 'shared' },
      },
    })
  })

  it('reads folded shared deploys with their count and the latest version', () => {
    expect(
      renderNotification(
        record({
          event: 'workflow.deploy.shared',
          count: 4,
          meta: { person: 'Lena Ortiz', workflow: 'Provision account', version: 9 },
        }),
        NOW,
      ).title,
    ).toBe(
      'Lena Ortiz deployed Provision account 4 times in the last hour (latest v9), shared with every workspace',
    )
  })

  it('reads an event this build does not know without failing', () => {
    const rendered = renderNotification(record({ event: 'something.new' }), NOW)
    expect(rendered.title).toBe('Something happened')
    expect(rendered.kind).toBe('people')
  })
})

describe('the catalog', () => {
  it('stores needs-action for failures, expiring keys, requests and asks only', () => {
    const waiting = (Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[]).filter(
      (event) => notificationKindOf(event).needsAction,
    )
    expect(waiting.sort()).toEqual([
      'access_request.create',
      'api_key.expiring',
      'invitation.ask_again',
      'run.failed',
    ])
  })

  it('knows its own events only', () => {
    expect(isNotificationEvent('run.failed')).toBe(true)
    expect(isNotificationEvent('toString')).toBe(false)
  })
})

describe('helpers', () => {
  it('folds failures into one group per workflow per clock hour', () => {
    expect(runFailureGroupKey('wf_1', new Date('2026-10-30T12:59:59.000Z'))).toBe(
      'run.failed:wf_1:2026-10-30T12',
    )
    expect(runFailureGroupKey('wf_1', new Date('2026-10-30T13:00:00.000Z'))).toBe(
      'run.failed:wf_1:2026-10-30T13',
    )
  })

  it('cleans and caps typed text', () => {
    expect(notificationText('Bad‮name')).toBe('Badname')
    expect(notificationText('x'.repeat(300))).toHaveLength(200)
  })
})
