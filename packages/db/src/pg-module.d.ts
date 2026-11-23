// The part of `pg` the Worker path uses. Not `@types/pg`: adding it as a
// dependency gives drizzle-orm a second peer variant in the lockfile, which
// would change what the Node and Docker installs resolve.
declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string
    max?: number
    idleTimeoutMillis?: number
  }
  export interface PoolClient {
    query(...args: unknown[]): Promise<unknown>
    release(err?: Error | boolean): void
  }
  export class Pool {
    constructor(config?: PoolConfig)
    query(...args: unknown[]): Promise<unknown>
    connect(): Promise<PoolClient>
    end(): Promise<void>
  }
  const pg: { Pool: typeof Pool }
  export default pg
}
