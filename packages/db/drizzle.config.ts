import { defineConfig } from 'drizzle-kit'

const dialect = process.env['DB_DIALECT'] === 'pg' ? 'postgresql' : 'sqlite'
const schema =
  dialect === 'postgresql'
    ? './drizzle-schema.pg.ts'
    : './drizzle-schema.sqlite.ts'

export default defineConfig({
  schema,
  out: './drizzle',
  dialect,
  dbCredentials:
    dialect === 'postgresql'
      ? { url: process.env['DATABASE_URL']! }
      : { url: process.env['DATABASE_URL'] ?? 'file:../../apps/api/awaitstep.db' },
})
