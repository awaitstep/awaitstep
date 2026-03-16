import type { StepConfig } from '@awaitstep/ir'

export function generateStepConfig(config?: StepConfig): string | null {
  if (!config) return null

  const parts: string[] = []

  if (config.retries) {
    const retryParts: string[] = [`limit: ${config.retries.limit}`]
    retryParts.push(`delay: ${formatDuration(config.retries.delay)}`)
    if (config.retries.backoff) {
      retryParts.push(`backoff: "${config.retries.backoff}"`)
    }
    parts.push(`retries: { ${retryParts.join(', ')} }`)
  }

  if (config.timeout !== undefined) {
    parts.push(`timeout: ${formatDuration(config.timeout)}`)
  }

  if (parts.length === 0) return null

  return `{ ${parts.join(', ')} }`
}

function formatDuration(value: number | string): string {
  return typeof value === 'string' ? `"${value}"` : String(value)
}
