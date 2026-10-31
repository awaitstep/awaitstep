import { describe, expect, it } from 'vitest'
import {
  AUDIT_EVENTS,
  auditText,
  describeKeyGrid,
  formatWait,
  isAuditEventCode,
  maskIp,
  renderAuditEvent,
  verifyLockSeconds,
  verifyLockout,
  type AuditEventCode,
} from '../audit.js'

describe('renderAuditEvent', () => {
  it('reads as the board’s blocked deletion, with the address last', () => {
    expect(
      renderAuditEvent(
        'workspace.delete.blocked',
        { name: 'IT', reason: 'Turn off the deletion lock first' },
        { ip: '81.2.69.x' },
      ),
    ).toEqual({
      kind: 'danger',
      action: 'tried to delete the workspace',
      target: 'IT',
      detail: 'Blocked by the deletion lock · 81.2.69.x',
    })
  })

  it('puts the version on a deploy’s target and says how it was made', () => {
    expect(
      renderAuditEvent(
        'workflow.deploy',
        { name: 'Lead enrichment', version: 12 },
        { via: 'Project API key …a71d' },
      ),
    ).toEqual({
      kind: 'deploy',
      action: 'deployed',
      target: 'Lead enrichment v12',
      detail: 'Project API key …a71d',
    })
  })

  it('names the person in access events and the role change in the detail', () => {
    expect(
      renderAuditEvent('workspace_member.add', {
        name: 'Sales',
        person: 'Daniel Kim',
        role: 'Editor',
      }),
    ).toMatchObject({ action: 'added Daniel Kim to', target: 'Sales', detail: 'Role: Editor' })
    expect(
      renderAuditEvent('workspace_member.role', {
        name: 'Sales',
        person: 'Priya Shah',
        fromRole: 'Viewer',
        role: 'Editor',
      }),
    ).toMatchObject({ action: 'changed Priya Shah’s role in', detail: 'Viewer → Editor' })
  })

  it('describes a key’s grid, a lockout and a project move', () => {
    expect(
      renderAuditEvent(
        'api_key.create',
        { name: 'CRM webhook', summary: 'read, write on Workflows' },
        { via: 'Dashboard' },
      ).detail,
    ).toBe('read, write on Workflows · Dashboard')
    expect(
      renderAuditEvent('connection.verify.locked', {
        name: 'Cloudflare',
        failures: 4,
        lockedForSeconds: 30,
      }).detail,
    ).toBe('4 failed checks · locked for 30 s')
    expect(renderAuditEvent('project.move.out', { name: 'P', otherOrg: 'Beta' }).detail).toBe(
      'To Beta',
    )
  })

  it('strips controls and direction overrides from chosen text, and bounds it', () => {
    expect(auditText('Ev\u202Eil\u0000 name\n')).toBe('Evil name')
    expect(auditText('x'.repeat(500))).toHaveLength(200)
    expect(
      renderAuditEvent('connection.create', { name: 'Prod\u202E', provider: 'cloud\u0007flare' })
        .detail,
    ).toBe('Cloudflare')
    expect(renderAuditEvent('workflow.delete', { name: 'y'.repeat(300) }).target).toHaveLength(200)
  })

  it('says what blocked a refused deletion', () => {
    expect(
      renderAuditEvent('project.delete.blocked', { name: 'P', reason: 'Sales is locked' }).detail,
    ).toBe('Blocked: Sales is locked')
  })

  it('leaves the detail empty when nothing is known', () => {
    expect(renderAuditEvent('workflow.delete', { name: 'Old onboarding' }).detail).toBe('')
  })

  // The person's own account events read "… their account" whatever the name.
  const ACCOUNT_EVENTS: readonly AuditEventCode[] = [
    'account.method_connect',
    'account.method_disconnect',
    'session.revoke',
    'account.export',
    'account.delete',
  ]

  it.each(Object.keys(AUDIT_EVENTS) as AuditEventCode[])(
    '%s renders a non-empty action and target',
    (code) => {
      const row = renderAuditEvent(code, { name: 'Target' })
      expect(row.action.length).toBeGreaterThan(0)
      expect(row.target).toContain(ACCOUNT_EVENTS.includes(code) ? 'their account' : 'Target')
    },
  )

  it('reads account events as the person’s own', () => {
    expect(renderAuditEvent('account.method_connect', { name: '', provider: 'github' })).toEqual({
      kind: 'auth',
      action: 'connected GitHub to',
      target: 'their account',
      detail: '',
    })
    expect(
      renderAuditEvent('account.method_disconnect', { name: '', provider: 'google' }).action,
    ).toBe('disconnected Google from')
    expect(renderAuditEvent('session.revoke', { name: '', count: 1 }).action).toBe(
      'signed out a session of',
    )
    expect(renderAuditEvent('session.revoke', { name: '', count: 3 }).action).toBe(
      'signed out 3 sessions of',
    )
    expect(renderAuditEvent('account.delete', { name: '' }).kind).toBe('danger')
    expect(renderAuditEvent('member.leave', { name: 'Bolt Labs' })).toMatchObject({
      kind: 'access',
      action: 'left',
      target: 'Bolt Labs',
    })
  })

  it('never names an unknown provider', () => {
    expect(renderAuditEvent('account.method_connect', { name: '', provider: 'x' }).action).toBe(
      'connected a sign-in method to',
    )
  })

  it('knows its own codes and nothing else', () => {
    expect(isAuditEventCode('workspace.delete')).toBe(true)
    expect(isAuditEventCode('toString')).toBe(false)
    expect(isAuditEventCode('workspace.explode')).toBe(false)
  })
})

describe('describeKeyGrid', () => {
  it('groups resources that share their actions', () => {
    expect(
      describeKeyGrid({ workflows: ['read', 'write'], runs: ['read'], variables: ['read'] }),
    ).toBe('read, write on Workflows · read on Runs, Variables')
    expect(describeKeyGrid({ audit: ['read'], projects: [] })).toBe('read on Audit log')
    expect(describeKeyGrid({})).toBe('')
  })
})

describe('maskIp', () => {
  it.each([
    ['81.2.69.142', '81.2.69.x'],
    ['::ffff:203.0.113.9', '203.0.113.x'],
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3::x'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8:0::x'],
    ['::1', '0:0:0::x'],
    ['fe80::1%eth0', 'fe80:0:0::x'],
  ])('%s → %s', (address, masked) => {
    expect(maskIp(address)).toBe(masked)
  })

  it.each(['', '  ', 'unknown', '300.1.1.1', '1.2.3', '1:2:3', 'a::b::c', null, undefined])(
    'refuses %s',
    (address) => {
      expect(maskIp(address)).toBeNull()
    },
  )
})

describe('token-check lockout', () => {
  it('waits nothing for three failures, then 30 s doubling to a 5 min cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 50].map(verifyLockSeconds)).toEqual([
      0, 0, 0, 0, 30, 60, 120, 240, 300, 300, 300,
    ])
  })

  it('locks from the last failure until the wait runs out', () => {
    const last = new Date('2026-10-30T10:00:00Z')
    expect(verifyLockout(3, last, new Date('2026-10-30T10:00:01Z'))).toBeNull()
    expect(verifyLockout(4, last, new Date('2026-10-30T10:00:00.500Z'))).toEqual({
      retryAfterSeconds: 30,
    })
    expect(verifyLockout(4, last, new Date('2026-10-30T10:00:29Z'))).toEqual({
      retryAfterSeconds: 1,
    })
    expect(verifyLockout(4, last, new Date('2026-10-30T10:00:30Z'))).toBeNull()
    expect(verifyLockout(5, last, new Date('2026-10-30T10:00:30Z'))).toEqual({
      retryAfterSeconds: 30,
    })
    expect(verifyLockout(9, null, last)).toBeNull()
  })

  it('says waits in words', () => {
    expect(formatWait(30)).toBe('30 s')
    expect(formatWait(120)).toBe('2 min')
    expect(formatWait(90)).toBe('1 min 30 s')
  })
})
