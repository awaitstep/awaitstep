import type { DatabaseAdapter, Workflow, CFConnection } from '@awaitstep/db'

export interface AppEnv {
  Variables: {
    db: DatabaseAdapter
    userId: string
    user: { id: string; email: string; name?: string } | null
    session: { id: string; userId: string; expiresAt: Date } | null
    workflow: Workflow | undefined
    connection: CFConnection | undefined
  }
}
