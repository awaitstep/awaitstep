// The dashboard's own data hooks an extension's pages may use. Through these
// they share the dashboard's query client and cache: a connection an
// extension renames shows renamed on every page, and theirs on its page.

export {
  useConnections,
  useOAuthStatus,
  useOrgAccounts,
  useRemoveConnection,
  useStartCloudflareOAuth,
  useUpdateConnection,
} from '../data/dashboard/org-settings'
export type { Connection } from '../types/dashboard/org-settings'
export type { ConnectionAccount } from '@awaitstep/ir'
export { useExtensionMutation, useExtensionQuery, type ExtensionWrite } from './extension-api'
