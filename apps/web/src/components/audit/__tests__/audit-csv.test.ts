import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '../../../types/dashboard/audit'
import { auditCsvName, auditToCsv } from '../audit-csv'

const EVENT: AuditEvent = {
  id: 'aud_1',
  at: '2026-10-27T09:00:00.000Z',
  kind: 'danger',
  actor: 'Tom Becker',
  action: 'tried to delete the workspace',
  target: 'IT',
  detail: 'Blocked by the deletion lock · 81.2.69.x',
  scope: { level: 'project', name: 'Project 101' },
}

describe('audit CSV', () => {
  it('writes a header and one row per event', () => {
    expect(auditToCsv([EVENT])).toBe(
      'Time,Person,Action,Target,Details,Level,Where\n' +
        '2026-10-27T09:00:00.000Z,Tom Becker,tried to delete the workspace,IT,Blocked by the deletion lock · 81.2.69.x,Project,Project 101\n',
    )
  })

  it('keeps text that looks like a formula as text, and quotes commas', () => {
    const csv = auditToCsv([{ ...EVENT, target: '=HYPERLINK("x")', detail: 'a, b' }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"a, b"')
  })

  it('names the file after the org and the day', () => {
    expect(auditCsvName('acme', new Date('2026-10-27T12:00:00Z'))).toBe(
      'acme-audit-log-2026-10-27.csv',
    )
  })
})
