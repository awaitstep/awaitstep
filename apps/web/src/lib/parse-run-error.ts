export interface ParsedRunError {
  name?: string
  message: string
  stack?: string
  raw: string
}

/** Normalize a run error (string, JSON string, or error-shaped object) for display. */
export function parseRunError(error: unknown): ParsedRunError {
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error)
      if (typeof parsed === 'object' && parsed !== null) return parseRunError(parsed)
    } catch {
      /* plain string */
    }
    return { message: error, raw: error }
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const raw = JSON.stringify(error, null, 2)
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      message: typeof obj.message === 'string' ? obj.message : raw,
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
      raw,
    }
  }
  return { message: String(error), raw: String(error) }
}
