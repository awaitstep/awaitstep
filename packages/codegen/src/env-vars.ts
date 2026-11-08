/**
 * Split declared env vars into plain variables and secrets. Values never
 * reach generated code; this is the shape a local run or provider host
 * receives.
 */
export function splitEnvVars(
  envVars: Record<string, { value: string; isSecret: boolean }>,
  options?: { exclude?: (name: string) => boolean },
): {
  vars: Record<string, string>
  secrets: Record<string, string>
} {
  const vars: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const [name, entry] of Object.entries(envVars)) {
    if (options?.exclude?.(name)) continue
    if (entry.value === undefined) continue
    if (entry.isSecret) secrets[name] = entry.value
    else vars[name] = entry.value
  }
  return { vars, secrets }
}
