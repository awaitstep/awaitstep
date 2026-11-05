/**
 * A deployed worker's URL, when it's one to link to: the provider answers
 * https URLs, and anything else (a stored oddity, a `javascript:` value) is
 * not offered as a link or a thing to copy.
 */
export function workerUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
