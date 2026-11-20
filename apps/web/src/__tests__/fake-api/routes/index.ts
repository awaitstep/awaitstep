import type { FakeApiContext, RouteTable } from '../types'
import { accountRoutes } from './account'
import { auditRoutes } from './audit'
import { authRoutes } from './auth'
import { connectionRoutes } from './connections'
import { inboxRoutes } from './inbox'
import { inviteRoutes } from './invites'
import { keyRoutes } from './keys'
import { memberRoutes } from './members'
import { orgSettingsRoutes } from './org-settings'
import { resourceRoutes } from './resources'
import { runRoutes } from './runs'
import { sessionRoutes } from './session'
import { variableRoutes } from './variables'
import { workflowRoutes } from './workflows'
import { workspaceRoutes } from './workspaces'

// Every route the fake answers without being told. A slice that moves its
// domain onto the fake adds its module here (one file per domain).
const DOMAINS = [
  sessionRoutes,
  authRoutes,
  accountRoutes,
  inviteRoutes,
  workflowRoutes,
  memberRoutes,
  keyRoutes,
  variableRoutes,
  workspaceRoutes,
  connectionRoutes,
  orgSettingsRoutes,
  runRoutes,
  auditRoutes,
  inboxRoutes,
  resourceRoutes,
]

export function baseRoutes(api: FakeApiContext): RouteTable {
  return Object.assign({}, ...DOMAINS.map((routes) => routes(api))) as RouteTable
}
