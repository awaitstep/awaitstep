import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as sqliteSchema from '../schema/sqlite/index.js'
import type * as pgSchema from '../schema/pg/index.js'

export type SqliteDrizzleDB = BaseSQLiteDatabase<'async' | 'sync', unknown, typeof sqliteSchema>
export type PgDrizzleDB = PgDatabase<never, typeof pgSchema>

export type DrizzleDB = SqliteDrizzleDB | PgDrizzleDB
