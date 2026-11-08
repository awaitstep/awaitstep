// A workflow row as the API answers it. Every response that carries one goes
// through here, so a secret can never leave just because a route forgot.

export const SECRET_MASK = '••••••••'

/** The editors write a secret as `isSecret: true` or a `SECRET_` name; both are secret. */
export function isSecretEnvVar(variable: { name: string; isSecret?: boolean }): boolean {
  return variable.isSecret === true || variable.name.startsWith('SECRET_')
}

/**
 * The workflow's `envVars` with every secret's value masked. A value that
 * cannot be read is dropped rather than passed through: old or malformed
 * rows must fail closed.
 */
export function maskedWorkflowEnvVars(envVars: string | null | undefined): string | null {
  if (!envVars) return envVars ?? null
  try {
    const parsed: unknown = JSON.parse(envVars)
    if (!Array.isArray(parsed)) return null
    const masked = parsed.map((variable) => {
      if (typeof variable !== 'object' || variable === null) return null
      const row = variable as { name?: unknown; value?: unknown; isSecret?: unknown }
      if (typeof row.name !== 'string') return null
      return isSecretEnvVar({ name: row.name, isSecret: row.isSecret === true })
        ? { ...variable, value: SECRET_MASK }
        : variable
    })
    return masked.some((variable) => variable === null) ? null : JSON.stringify(masked)
  } catch {
    return null
  }
}

/** One workflow record, its secret values masked or dropped. */
export function workflowRecord<T extends { envVars?: string | null }>(workflow: T): T {
  const envVars = maskedWorkflowEnvVars(workflow.envVars)
  if (envVars === (workflow.envVars ?? null)) return workflow
  return { ...workflow, envVars } as T
}
