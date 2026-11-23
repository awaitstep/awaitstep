import { describe, it, expect } from 'vitest'
import { workerDatabase } from '../entry/worker-database.js'

const hyperdrive = {
  connectionString: 'postgres://u:p@hyperdrive.local:5432/awaitstep',
} as Hyperdrive
const d1 = {} as D1Database

describe('workerDatabase', () => {
  it('uses Postgres when HYPERDRIVE is bound, even with D1 bound too', () => {
    expect(workerDatabase({ HYPERDRIVE: hyperdrive, DB: d1 }, {}).dialect).toBe('pg')
  })

  it('falls back to D1 when only DB is bound, running work as it is', () => {
    const database = workerDatabase({ DB: d1 }, {})
    expect(database.dialect).toBe('sqlite')
    expect(database.run(() => 42)).toBe(42)
  })

  it('refuses to start with no database bound, naming both bindings', () => {
    expect(() => workerDatabase({}, {})).toThrow(/bind HYPERDRIVE \(Postgres\) or DB \(D1\)/)
  })

  it('refuses a Postgres query made outside a request', async () => {
    const database = workerDatabase({ HYPERDRIVE: hyperdrive }, {})
    const failure = await database.db.countProjectsInOrganization('org-1').then(
      () => null,
      (err: unknown) => err as Error & { cause?: Error },
    )
    expect(failure?.cause?.message).toMatch(/outside a request/)
  })
})
