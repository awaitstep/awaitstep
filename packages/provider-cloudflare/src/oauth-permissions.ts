/**
 * The permissions AwaitStep asks Cloudflare for: the scopes its OAuth sign-in
 * requests, each with the name Cloudflare's dashboard gives it. The token
 * form lists the same ones, so a pasted API token is made with what sign-in
 * would grant. Browser-safe (its own entry point): the dashboard reads it.
 *
 * Cloudflare puts creating a Worker under product-level Admin
 * (`workers-scripts.admin`); Editor may only deploy one that already exists.
 * KV Read and Write are separate: the Resources UI lists keys and writes them.
 */
export const CLOUDFLARE_PERMISSIONS = [
  { scope: 'account-settings.read', label: 'Account · Account Settings · Read' },
  { scope: 'workers-scripts.admin', label: 'Account · Workers Scripts · Admin' },
  { scope: 'workers-kv-storage.read', label: 'Account · Workers KV Storage · Read' },
  { scope: 'workers-kv-storage.write', label: 'Account · Workers KV Storage · Write' },
] as const

/** The OAuth scopes requested when `CLOUDFLARE_OAUTH_SCOPES` doesn't name others. */
export const DEFAULT_CLOUDFLARE_OAUTH_SCOPES: string[] = CLOUDFLARE_PERMISSIONS.map((p) => p.scope)
