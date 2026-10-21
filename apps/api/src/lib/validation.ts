import type { Context } from 'hono'
import type { ValidationTargets } from 'hono'
import { zValidator as zv } from '@hono/zod-validator'
import type { ZodType, ZodError } from 'zod'

export const zValidator = <T, Target extends keyof ValidationTargets>(
  target: Target,
  schema: ZodType<T>,
) =>
  zv(target, schema, (result, c: Context) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: extractErrors(result.error as ZodError),
        },
        422,
      )
    }
  })

export interface ValidationFailure {
  errors: Array<{ path: string; message: string }>
}

/**
 * Validates a JSON body that may be absent entirely, for a POST whose body
 * is all optional: an agent asking the plainest form of the question should
 * not have to send `{}` and a `Content-Type` to be understood.
 *
 * An absent body is an empty object. A body that is present but unparseable
 * is an error, never silently an empty one — dropping it would answer a
 * question about files the caller sent and we never read.
 */
export async function parseOptionalJson<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<{ data: T } | ValidationFailure> {
  const raw = await c.req.text()
  let value: unknown = {}
  if (raw.trim().length > 0) {
    try {
      value = JSON.parse(raw)
    } catch {
      return { errors: [{ path: '', message: 'Body is not valid JSON' }] }
    }
  }
  const result = schema.safeParse(value)
  return result.success ? { data: result.data } : { errors: extractErrors(result.error) }
}

function extractErrors(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}
