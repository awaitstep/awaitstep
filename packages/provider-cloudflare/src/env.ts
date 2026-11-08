import { splitEnvVars as split } from '@awaitstep/codegen'

/** Provider-internal env names never reach the app's vars/secrets. */
export function splitEnvVars(envVars: Record<string, { value: string; isSecret: boolean }>) {
  return split(envVars, { exclude: (name) => name.endsWith('_BINDING_ID') })
}
