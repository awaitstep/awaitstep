// What a log line may carry: nothing that identifies a provider account or
// works as a credential. AwaitStep's own ids (nanoids, 21 characters), the
// provider's instance ids, statuses, error names, hashes and code identifiers
// stay readable — they are what a report is traced by.
//
// Every pattern is bounded (no unbounded quantifier that can rescan from each
// position), and text past MAX_TEXT is cut before any rule runs: the request
// logger feeds it URLs a caller chose.

const REDACTED = '[redacted]'

// A key whose value is a secret, whatever it looks like: names that end in
// one (`sessionToken`, `webhookSecret`, `x-api-key`).
const SECRET_KEY =
  /(?:token|token[-_]?hash|secret|secret[-_]?key|access[-_]?key|encrypted[-_]?key|password|passwd|credentials?|cookie|authorization|api[-_]?key|private[-_]?key|key[-_]?hash|^auth|^bearer|^pass|^pwd)$/i

// Long strings that are ids or code, not secrets: a UUID, a worker name
// (`workerName()` output: lowercase, hyphens), a digest with its algorithm,
// and a run without digits (a code identifier or a slug; a random token of
// 30+ base64url characters almost always has one).
const KEPT_LONG =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|awaitstep-[a-z0-9-]{1,48}|[A-Za-z_-]+)$/

// Names whose value is a credential, in a query string or a `name=value`,
// `name: value` or `'name': 'value'` dump.
const SECRET_PARAM =
  '[a-z]{1,20}[-_]token|token|api[-_]?token|apitoken|api[-_]?key|apikey|client[-_]?secret|secret[-_]?key|secret|code|signature|sig|password|passwd|key|session[-_]?data|better-auth\\.[a-z_.]{1,40}'
// JSON fields whose value is a credential, in JSON text (escaped or not).
const SECRET_FIELD =
  'api[-_]?token|access[-_]?token|refresh[-_]?token|id[-_]?token|token|api[-_]?key|key|password|secret|client[-_]?secret|authorization|cookie|credentials'

/** The most of one string a log line keeps; the middle of a longer one is cut before redacting. */
export const MAX_TEXT = 8_192
// What a cut keeps of the end: a request line's status and timing.
const KEPT_TAIL = 200

type Rule = [RegExp, string | ((...match: string[]) => string)]

// In order: the more specific first.
const TEXT_RULES: Rule[] = [
  // Cloudflare's REST paths name the account (and zone) by id.
  [/\/(accounts|zones)\/[^/\s?#"']{1,64}/gi, '/$1/[account]'],
  // A workers.dev address names the account's subdomain.
  [/\b([a-z0-9-]{1,63})\.[a-z0-9-]{1,63}\.workers\.dev\b/gi, '$1.[account].workers.dev'],
  // Credentials in a URL: `scheme://user:password@host` (the user may be empty,
  // the password may hold an `@`: everything up to the host's).
  [
    /\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@]{0,64}):[^\s/]{1,128}@(?=[^\s/@]{1,253}(?:[/:?#\s]|$))/gi,
    '$1:[redacted]@',
  ],
  // `Bearer …` (any case) / `Basic …` / `Token …` with a value that looks like one (8+ token characters).
  [/\b([Bb]earer|BEARER|Basic|Token)[ \t]{1,4}[A-Za-z0-9+/=._~-]{8,4096}/g, '$1 [redacted]'],
  // AwaitStep API keys (8+ characters after the prefix: `ask_again` is a word).
  [/\bask_[A-Za-z0-9_-]{8,256}/g, 'ask_[redacted]'],
  // JWTs: three base64url parts, the first a JSON header.
  [/\beyJ[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,8192}\.[A-Za-z0-9_-]{1,2048}/g, '[jwt]'],
  // Credentials in a query string or a `key=value` / `key: value` dump (a value of 6+ characters).
  [new RegExp(`(?<![A-Za-z0-9])(${SECRET_PARAM})=[^\\s&"'#]{6,2048}`, 'gi'), '$1=[redacted]'],
  // The same names as `name: value` (an inspected object, a header dump). Not
  // `code`, `key` or `sig`: an error's `code: 'ECONNREFUSED'` stays.
  [
    new RegExp(
      `(?<![A-Za-z0-9])((?!code\\b|key\\b|sig\\b)(?:${SECRET_PARAM}))(['"]?[ \\t]{0,4}:[ \\t]{0,4}['"]?)[^\\s&"'#,;}]{6,2048}`,
      'gi',
    ),
    '$1$2[redacted]',
  ],
  // A failed query's parameters (drizzle's `params: a,b,c`): row values, a token among them.
  [/\bparams: [^\n]{1,4096}/g, 'params: [redacted]'],
  // `"apiToken":"…"` inside JSON text, also when the JSON is itself escaped.
  [
    new RegExp(
      `((?:\\\\?")(?:${SECRET_FIELD})\\\\?"\\s{0,4}:\\s{0,4})\\\\?"[^"\\\\]{0,2048}\\\\?"`,
      'gi',
    ),
    '$1"[redacted]"',
  ],
  // Cloudflare ids (account, zone, script tags): 32 hex characters on their own.
  [/(?<![\w-])[0-9a-f]{32}(?![\w-])/gi, '[id]'],
  // A standard-base64 blob (an encrypted value, a signature): its `+` or `=`
  // tells it from a path, which the run rule below would cut into pieces.
  [
    /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,8192}={0,2}(?![A-Za-z0-9+/=])/g,
    (match: string) => (/[+]|=$/.test(match) ? REDACTED : match),
  ],
  // Anything long and opaque left: a token in a form no rule above knows.
  [
    /(?<![\w-])(?:(?:sha(?:1|256|384|512)[:-])?[A-Za-z0-9_-]{30,8192})(?![\w-])/g,
    (match: string) => (/^sha\d{1,3}[:-]/.test(match) || KEPT_LONG.test(match) ? match : REDACTED),
  ],
  // Email addresses keep their first letter and domain (bounded: a long run
  // of dots or `%2…` must not rescan).
  [
    /(?<![A-Za-z0-9._%+-])([A-Za-z0-9])[A-Za-z0-9._%+-]{0,63}(?:@|%40)([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24})\b/g,
    (_match: string, first: string, domain: string) => `${first}…@${domain}`,
  ],
]

// eslint-disable-next-line no-control-regex -- control characters are what is escaped
const CONTROL = /[\u0000-\u001f\u007f]/g

// The text with %-escapes read (a nested `%3Ftoken%3D…` is a token too), and
// control characters shown escaped, so a decoded `%0A` can't start a fake
// log line. Text that isn't valid escaping is read as it is.
function readable(text: string): string {
  let decoded = text
  if (text.includes('%')) {
    try {
      decoded = decodeURIComponent(text)
    } catch {
      decoded = text
    }
  }
  if (decoded === text) return text
  return decoded.replace(CONTROL, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

/** The text with account ids, credentials and email addresses taken out; cut at {@link MAX_TEXT}. */
export function redactText(text: string): string {
  let out = readable(text)
  if (out.length > MAX_TEXT) {
    const cut = out.length - MAX_TEXT
    out = `${out.slice(0, MAX_TEXT - KEPT_TAIL)}… [${cut} cut] …${out.slice(-KEPT_TAIL)}`
  }
  for (const [pattern, replacement] of TEXT_RULES) {
    out = out.replace(pattern, replacement as string)
  }
  return out
}

const MAX_DEPTH = 6
// The most values one log line redacts; past it the rest reads `[more]`.
const MAX_NODES = 2_000

// A secret-named key keeps a boolean or number (whether a token is there, a
// count), and loses anything else.
function secretValue(value: unknown): unknown {
  return typeof value === 'boolean' || typeof value === 'number' || value == null || value === ''
    ? value
    : REDACTED
}

function entriesOf(value: object): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = []
  for (const key of Object.keys(value)) {
    try {
      out.push([key, (value as Record<string, unknown>)[key]])
    } catch {
      out.push([key, '[unreadable]'])
    }
  }
  return out
}

function redactEntries(
  entries: Iterable<[unknown, unknown]>,
  depth: number,
  walk: Walk,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [rawKey, item] of entries) {
    const key = String(rawKey)
    out[key] = SECRET_KEY.test(key) ? secretValue(item) : redact(item, depth + 1, walk)
  }
  return out
}

interface Walk {
  path: Set<object>
  nodes: number
}

function redact(value: unknown, depth: number, walk: Walk): unknown {
  if (++walk.nodes > MAX_NODES) return '[more]'
  if (typeof value === 'string') return redactText(value)
  // A function (an own `toJSON` among them) would run, or print, unredacted.
  if (typeof value === 'function') return '[function]'
  if (typeof value === 'bigint') return value.toString()
  if (value === null || typeof value !== 'object') return value
  // Only a true cycle (an ancestor) is cut; an object met twice side by side is logged twice.
  if (walk.path.has(value)) return '[circular]'
  if (depth >= MAX_DEPTH) return '[nested]'
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  if (value instanceof URL) return redactText(value.href)
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `[${(value as ArrayBufferView | ArrayBuffer).byteLength} bytes]`
  }
  walk.path.add(value)
  try {
    if (value instanceof Error) {
      const cause = (value as { cause?: unknown }).cause
      const errors = value instanceof AggregateError ? value.errors : undefined
      // Its own fields (a status, a code, a database detail), the secret-named ones withheld.
      const own = redactEntries(
        entriesOf(value).filter(([key]) => key !== 'cause' && key !== 'errors'),
        depth,
        walk,
      )
      return {
        name: value.name,
        message: redactText(value.message),
        ...own,
        ...(value.stack && { stack: redactText(value.stack) }),
        ...(cause !== undefined && { cause: redact(cause, depth + 1, walk) }),
        ...(errors && { errors: errors.map((item: unknown) => redact(item, depth + 1, walk)) }),
      }
    }
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, walk))
    if (value instanceof Map) return redactEntries(value.entries(), depth, walk)
    if (value instanceof Set) return [...value].map((item) => redact(item, depth + 1, walk))
    if (typeof Headers !== 'undefined' && value instanceof Headers) {
      return redactEntries(value.entries(), depth, walk)
    }
    if (typeof Request !== 'undefined' && value instanceof Request) {
      return { method: value.method, url: redactText(value.url) }
    }
    if (typeof Response !== 'undefined' && value instanceof Response) {
      return { status: value.status, url: redactText(value.url) }
    }
    return redactEntries(entriesOf(value), depth, walk)
  } finally {
    walk.path.delete(value)
  }
}

/**
 * A copy of `value` fit for a log line: strings redacted, values under a
 * secret-named key withheld (a boolean or number stays), errors as
 * `{ name, message, …own fields, stack, cause }`, dates as ISO text, bytes as
 * their size, cycles and depth bounded. Never throws.
 */
export function redactValue(value: unknown): unknown {
  try {
    return redact(value, 0, { path: new Set(), nodes: 0 })
  } catch {
    return '[unloggable]'
  }
}
