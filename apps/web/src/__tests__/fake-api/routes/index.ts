import type { FakeApiContext, RouteTable } from '../types'
import { accountRoutes } from './account'
import { authRoutes } from './auth'
import { inviteRoutes } from './invites'
import { sessionRoutes } from './session'

// Every route the fake answers without being told. A slice that moves its
// domain onto the fake adds its module here (one file per domain).
const DOMAINS = [sessionRoutes, authRoutes, accountRoutes, inviteRoutes]

export function baseRoutes(api: FakeApiContext): RouteTable {
  return Object.assign({}, ...DOMAINS.map((routes) => routes(api))) as RouteTable
}
