import { REPO_URL } from '../content/site'

const API_URL = REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/')
/** After a failed fetch, wait this long before asking GitHub again (the dev server asks per page). */
const RETRY_AFTER_MS = 5 * 60 * 1000

/** A star count as the nav shows it: 999, then 1k, 1.2k. */
export function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}

let found: string | undefined
let pending: Promise<string | null> | undefined
let failedAt = 0

/**
 * The repository's star count. A build asks GitHub once and every page shares the answer; the
 * dev server keeps a found count for the session. When GitHub can't be read (anonymous requests
 * are limited to 60 an hour; set GITHUB_TOKEN for 5,000) it returns null, the nav shows no number,
 * and it asks again only after a few minutes.
 */
export async function starCount(): Promise<string | null> {
  if (found) return found
  if (Date.now() - failedAt < RETRY_AFTER_MS) return null
  pending ??= fetchStars().then((stars) => {
    pending = undefined
    if (stars) found = stars
    else failedAt = Date.now()
    return stars
  })
  return pending
}

async function fetchStars(): Promise<string | null> {
  const token = import.meta.env.GITHUB_TOKEN as string | undefined
  try {
    const res = await fetch(API_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'awaitstep-www-build',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const { stargazers_count: n } = (await res.json()) as { stargazers_count?: unknown }
    return typeof n === 'number' ? formatStars(n) : null
  } catch {
    return null
  }
}
