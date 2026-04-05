/**
 * Split env vars into plain vars and secrets, filtering out
 * Cloudflare-specific `_BINDING_ID` entries which are used
 * internally to resolve resource bindings — not app env.
 */
export function splitEnvVars(envVars: Record<string, { value: string; isSecret: boolean }>): {
  vars: Record<string, string>
  secrets: Record<string, string>
} {
  const vars: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const [name, entry] of Object.entries(envVars)) {
    if (name.endsWith('_BINDING_ID')) continue
    if (entry.value === undefined) continue
    if (entry.isSecret) {
      secrets[name] = entry.value
    } else {
      vars[name] = entry.value
    }
  }
  return { vars, secrets }
}
