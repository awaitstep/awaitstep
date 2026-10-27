import * as activity from './activity'
import * as audit from './audit'
import * as items from './items'
import * as keys from './keys'
import * as locks from './locks'
import * as members from './members'
import * as org from './org'
import * as projects from './projects'
import * as requests from './requests'
import * as resources from './resources'
import * as runs from './runs'
import * as session from './session'
import * as setup from './setup'
import * as variables from './variables'
import * as workspaces from './workspaces'

/**
 * The fake API the dashboard hooks call until each feature's backend lands.
 * Shaped like the real one will be: slugs in, records with `viewerCan` out.
 */
export const mockServer = {
  session,
  projects,
  workspaces,
  locks,
  items,
  runs,
  activity,
  requests,
  setup,
  keys,
  variables,
  members,
  org,
  resources,
  audit,
}
