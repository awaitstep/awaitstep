import type { StepConfig } from '@awaitstep/ir'

const BACKOFFS = new Set(['constant', 'linear', 'exponential'])

/**
 * The step's config as a code literal. Every value is emitted as a JSON
 * literal, never pasted: a delay or timeout is a free string on the node,
 * and a backoff outside the three the runtime knows is left out.
 */
export function generateStepConfig(config?: StepConfig): string | null {
  if (!config) return null

  const parts: string[] = []

  if (config.retries) {
    const retryParts: string[] = [`limit: ${JSON.stringify(config.retries.limit)}`]
    retryParts.push(`delay: ${JSON.stringify(config.retries.delay)}`)
    if (config.retries.backoff && BACKOFFS.has(config.retries.backoff)) {
      retryParts.push(`backoff: ${JSON.stringify(config.retries.backoff)}`)
    }
    parts.push(`retries: { ${retryParts.join(', ')} }`)
  }

  if (config.timeout !== undefined) {
    parts.push(`timeout: ${JSON.stringify(config.timeout)}`)
  }

  if (parts.length === 0) return null

  return `{ ${parts.join(', ')} }`
}
