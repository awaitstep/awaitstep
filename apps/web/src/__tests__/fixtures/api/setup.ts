import type { ProjectSetup } from '@awaitstep/ir'
import { BOLT_API, INTERNAL, MARKETING, P101 } from './places'

/**
 * Project id → `GET /projects/:id/setup`. Project 101 sets two variables and
 * inherits Acme's three ("5 variables" on `EmptyWorkspace`); Marketing Site
 * overrides REGION.
 */
export const PROJECT_SETUP: Record<string, ProjectSetup> = {
  [P101]: { cloudflareConnected: true, orgVariables: 3, projectVariables: 2, projectKeys: 4 },
  [MARKETING]: { cloudflareConnected: true, orgVariables: 2, projectVariables: 1, projectKeys: 1 },
  [INTERNAL]: { cloudflareConnected: true, orgVariables: 3, projectVariables: 0, projectKeys: 0 },
  [BOLT_API]: { cloudflareConnected: false, orgVariables: 0, projectVariables: 0, projectKeys: 0 },
}
