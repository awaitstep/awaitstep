import { drizzle, type AnyD1Database } from 'drizzle-orm/d1'
import * as sqliteSchema from './schema/sqlite/index.js'
import { DrizzleDatabaseAdapter, type DrizzleAdapterOptions } from './adapters/index.js'

// D1's parameter binder coerces unknown objects via .toString(), which for
// `Date` produces "Tue Apr 14 2026 22:08:50 GMT+0000" — not an ISO string.
// Drizzle on better-sqlite3 stringifies dates automatically; D1 doesn't. We
// proxy the D1 binding's prepare() chain and convert any Date param to ISO
// before it reaches workerd, keeping both drivers compatible with the shared
// `text`-based timestamp columns in packages/db/src/schema/sqlite/auth.ts.
function coerceValue(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v
}

function wrapD1(binding: AnyD1Database): AnyD1Database {
  const original = binding as unknown as {
    prepare: (sql: string) => unknown
    batch?: (stmts: unknown[]) => Promise<unknown[]>
    exec?: (sql: string) => Promise<unknown>
    dump?: () => Promise<ArrayBuffer>
  }
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => wrapStmt(target.prepare(sql))
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as AnyD1Database
}

function wrapStmt(stmt: unknown): unknown {
  return new Proxy(stmt as object, {
    get(target, prop, receiver) {
      if (prop === 'bind') {
        return (...args: unknown[]) => {
          const coerced = args.map(coerceValue)
          const bound = (target as { bind: (...a: unknown[]) => unknown }).bind(...coerced)
          return wrapStmt(bound)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

export function createD1DrizzleDb(binding: AnyD1Database) {
  return drizzle(wrapD1(binding), { schema: sqliteSchema })
}

export function createD1DatabaseAdapter(
  binding: AnyD1Database,
  options?: DrizzleAdapterOptions,
): DrizzleDatabaseAdapter {
  const drizzleDb = createD1DrizzleDb(binding)
  return new DrizzleDatabaseAdapter(drizzleDb, sqliteSchema, options)
}

export { sqliteSchema }
