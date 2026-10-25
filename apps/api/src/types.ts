import type { DatabaseAdapter, Workflow, Connection } from '@awaitstep/db'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { TestSessionRunner } from '@awaitstep/codegen'
import type { TestSessionLimits } from './lib/test-session-policy.js'
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
    /** The caller's address, resolved once per request — the rate limiters' key. */
    clientIp: string | undefined
    /** The calling key — recorded as the parent of any key it mints. Null for sessions. */
    apiKeyId: string | null
    apiKeyScopes: ApiKeyScope[] | null
    /** The key's own expiry — the ceiling for any key it mints. Null for sessions. */
    apiKeyExpiresAt: string | null
    nodeRegistry: AppNodeRegistry
    remoteNodeRegistry: RemoteNodeRegistry | undefined
    appName: string | undefined
    deployer: WranglerDeployer | undefined
    testSessionRunner: TestSessionRunner | undefined
    testSessionLimits: TestSessionLimits
  }
}
