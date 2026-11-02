import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { checkImage, type ImageInfo, type ImageRule } from '@awaitstep/storage'
import type { AppEnv } from '../types.js'

// An upload is the image itself as the request body — `Content-Type:
// image/png` and the bytes, no base64 and no JSON around them.

function tooLarge(rule: ImageRule): string {
  return `The ${rule.what} must be at most ${Math.round(rule.maxBytes / 1024)} KB`
}

/**
 * Refuses a body over the rule's size with a 413, from its length or as it
 * streams in. `field` names the form field the refusal belongs under.
 */
export function imageBodyLimit(rule: ImageRule, field: 'image' | 'logo') {
  return bodyLimit({
    maxSize: rule.maxBytes,
    onError: (c) => c.json({ error: tooLarge(rule), field }, 413),
  })
}

export type ImageUpload = { bytes: Uint8Array; info: ImageInfo } | { problem: string }

/** The request's image, checked from its bytes, or why it can't be stored. */
export async function readImageUpload(c: Context<AppEnv>, rule: ImageRule): Promise<ImageUpload> {
  const type = c.req.header('Content-Type') ?? ''
  if (!type.toLowerCase().startsWith('image/')) {
    return { problem: `Send the ${rule.what} as the request body, with an image Content-Type` }
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  const check = checkImage(bytes, rule, type)
  return check.ok ? { bytes, info: check.info } : { problem: check.problem }
}
