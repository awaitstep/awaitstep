import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { getTableColumns, isTable, type Table } from 'drizzle-orm'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as pgSchema from '../schema/pg/index.js'
import { toIsoTimestamp } from '../schema/pg/iso-timestamp.js'

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const migrationsFolder = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))

async function createPgDb() {
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder })
  await client.exec(`
    INSERT INTO organization (id, name, slug) VALUES ('org-1', 'One', 'one');
    INSERT INTO projects (id, organization_id, name, slug) VALUES ('p-1', 'org-1', 'One', 'one');
  `)
  return { client, adapter: new DrizzleDatabaseAdapter(db, pgSchema) }
}

function keyData(id: string, overrides: { parentKeyId?: string; expiresAt?: string } = {}) {
  return {
    id,
    organizationId: 'org-1',
    createdBy: 'u-1',
    name: id,
    keyHash: `hash-${id}`,
    keyPrefix: 'ask_test',
    scopes: '["read"]',
    ...overrides,
  }
}

describe('toIsoTimestamp', () => {
  it('reads pg timestamp text as UTC ISO', () => {
    expect(toIsoTimestamp('2099-01-01 00:00:00')).toBe('2099-01-01T00:00:00.000Z')
    expect(toIsoTimestamp('2026-10-25 12:34:56.789123')).toBe('2026-10-25T12:34:56.789Z')
  })

  it('passes a Date through as ISO and leaves unparseable values alone', () => {
    expect(toIsoTimestamp(new Date('2099-01-01T00:00:00Z'))).toBe('2099-01-01T00:00:00.000Z')
    expect(toIsoTimestamp('infinity')).toBe('infinity')
  })
})

describe('pg schema timestamps', () => {
  // better-auth writes Dates; node-postgres would send them as local time, which
  // PGlite does not, so the write side is checked at the column.
  it('every timestamp column decodes to UTC ISO and writes Dates as UTC', () => {
    const tables = Object.values(pgSchema).filter((t): t is Table => isTable(t))
    const columns = tables.flatMap((t) =>
      Object.values(getTableColumns(t)).filter((c) => c.getSQLType().startsWith('timestamp')),
    )
    expect(columns.length).toBeGreaterThan(0)
    for (const column of columns) {
      expect(column.mapFromDriverValue('2099-01-01 00:00:00'), column.name).toBe(
        '2099-01-01T00:00:00.000Z',
      )
      expect(column.mapToDriverValue(new Date('2099-01-01T00:00:00Z')), column.name).toBe(
        '2099-01-01T00:00:00.000Z',
      )
    }
  })
})

describe('pg timestamps round-trip', () => {
  let db: Awaited<ReturnType<typeof createPgDb>>
  const originalTz = process.env['TZ']

  beforeEach(async () => {
    db = await createPgDb()
  })

  afterEach(async () => {
    process.env['TZ'] = originalTz
    await db.client.close()
  })

  it('returns a stored expiry and a defaulted createdAt as UTC ISO', async () => {
    await db.adapter.createApiKey(keyData('k-1', { expiresAt: '2099-01-01T00:00:00Z' }))
    const stored = await db.adapter.getApiKeyById('k-1')
    expect(stored?.expiresAt).toBe('2099-01-01T00:00:00.000Z')
    expect(stored?.createdAt).toMatch(ISO_UTC)
  })

  it('treats an expired parent as expired on a host west of UTC', async () => {
    process.env['TZ'] = 'America/New_York'
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await db.adapter.createApiKey(keyData('k-parent', { expiresAt: twoHoursAgo }))
    await db.adapter.createApiKey(keyData('k-child', { parentKeyId: 'k-parent' }))

    const auth = await db.adapter.getApiKeyAuthByHash('hash-k-child')
    expect(auth?.parentKeyLive).toBe(false)
  })

  it('returns a workflow list lastRunAt as UTC ISO', async () => {
    await db.adapter.createWorkflow({ id: 'w-1', projectId: 'p-1', createdBy: 'u-1', name: 'W' })
    await db.client.exec(`
      INSERT INTO workflow_runs (id, workflow_id, instance_id, created_at)
      VALUES ('r-1', 'w-1', 'i-1', '2026-10-25 10:00:00');
    `)

    const { data } = await db.adapter.listWorkflowsWithStatus('p-1')
    expect(data[0]?.lastRunAt).toBe('2026-10-25T10:00:00.000Z')
    expect(data[0]?.createdAt).toMatch(ISO_UTC)
  })
})
