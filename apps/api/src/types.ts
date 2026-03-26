import type { DatabaseAdapter, Workflow, Connection } from '@awaitstep/db'
import type { ApiKeyScope } from './middleware/auth.js'
import type { AppNodeRegistry } from './lib/node-registry.js'
import type { RemoteNodeRegistry } from './lib/remote-node-registry.js'

export interface AppEnv {
  Variables: {
    db: DatabaseAdapter
    userId: string
    organizationId: string
    projectId: string
    user: { id: string; email: string; name?: string } | null
    session: { id: string; userId: string; expiresAt: Date } | null
    workflow: Workflow | undefined
    connection: Connection | undefined
    requestId: string
    apiKeyScopes: ApiKeyScope[] | null
    nodeRegistry: AppNodeRegistry
    remoteNodeRegistry: RemoteNodeRegistry | undefined
    appName: string | undefined
  }
}
