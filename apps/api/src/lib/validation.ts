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

function extractErrors(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}
