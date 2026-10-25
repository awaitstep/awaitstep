/**
 * Who the client is — the key for every rate limit and the address recorded
 * on sessions.
 *
 * Forwarding headers are claims, and a claim is only worth what the party
 * making it is worth. So the trust is decided per deployment by the entry
 * point, never by whichever header happens to arrive:
 *
 * - `edge` (Workers): Cloudflare's edge writes `cf-connecting-ip` on every
 *   request and no client can set it, so that header is the answer.
 * - `proxied` (Node): a forwarding header counts only when the TCP peer
 *   itself is a trusted proxy — loopback by default (the web server's SSR
 *   calls, a proxy on the same host), plus whatever `TRUSTED_PROXIES` names.
 *   A client reaching the port directly is keyed on its own connection, so
 *   it cannot choose its address.
 */
export type ClientIpPolicy =
  { mode: 'edge'; header: string } | { mode: 'proxied'; trustedProxies: readonly string[] }

/** Proxies trusted on every Node deployment: anything on this host. */
export const LOOPBACK_PROXIES = ['127.0.0.0/8', '::1/128'] as const

/**
 * The header the API hands better-auth the resolved address in. Overwritten
 * on every request before better-auth sees it, so a client sending its own
 * copy changes nothing.
 */
export const CLIENT_IP_HEADER = 'x-awaitstep-client-ip'

interface HeaderSource {
  header: (name: string) => string | undefined
}

type Parsed = { family: 4; value: number } | { family: 6; value: bigint }

function parseIPv4(text: string): number | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function parseIPv6(text: string): bigint | null {
  let head = text
  let tailV4: number | null = null
  const lastColon = head.lastIndexOf(':')
  if (head.includes('.')) {
    tailV4 = parseIPv4(head.slice(lastColon + 1))
    if (tailV4 === null) return null
    head = `${head.slice(0, lastColon + 1)}0:0`
  }
  const halves = head.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right]
  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    value = (value << 16n) + BigInt(parseInt(group, 16))
  }
  if (tailV4 !== null) value = (value & ~0xffffffffn) | BigInt(tailV4)
  return value
}

const MAPPED_V4_PREFIX = 0xffffn << 32n

function parse(raw: string | undefined): Parsed | null {
  if (!raw) return null
  const text = raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]!
  if (text === '') return null
  const v4 = parseIPv4(text)
  if (v4 !== null) return { family: 4, value: v4 }
  const v6 = parseIPv6(text)
  if (v6 === null) return null
  // `::ffff:a.b.c.d` is an IPv4 client on a dual-stack socket: one client,
  // one key, whichever way the socket reported it.
  if (v6 >> 32n === 0xffffn && (v6 & ~0xffffffffn) === MAPPED_V4_PREFIX) {
    return { family: 4, value: Number(v6 & 0xffffffffn) }
  }
  return { family: 6, value: v6 }
}

function format(ip: Parsed): string {
  if (ip.family === 4) {
    const v = ip.value
    return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.')
  }
  const groups: string[] = []
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(((ip.value >> shift) & 0xffffn).toString(16))
  }
  return groups.join(':')
}

function contains(cidr: string, ip: Parsed): boolean {
  const [base, bitsText] = cidr.split('/')
  const network = parse(base)
  if (!network || network.family !== ip.family) return false
  const width = ip.family === 4 ? 32 : 128
  const bits = bitsText === undefined ? width : Number(bitsText)
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return false
  if (ip.family === 4) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (ip.value & mask) >>> 0 === ((network.value as number) & mask) >>> 0
  }
  const shift = BigInt(128 - bits)
  return ip.value >> shift === (network.value as bigint) >> shift
}

/**
 * The client's address under `policy`, or undefined when nothing names one.
 *
 * `proxied`: an untrusted peer is the client. A trusted peer forwarded the
 * request, so `X-Forwarded-For` is read from the right — each proxy appends
 * the address it saw — skipping entries that are themselves trusted; the
 * first untrusted one is the client. Entries left of it were written by
 * someone untrusted and are ignored. `X-Real-IP` stands in only when there
 * is no chain at all.
 */
export function resolveClientIp(
  req: HeaderSource,
  peer: string | undefined,
  policy: ClientIpPolicy,
): string | undefined {
  if (policy.mode === 'edge') {
    const ip = parse(req.header(policy.header))
    return ip ? format(ip) : undefined
  }

  const trusted = (ip: Parsed) => policy.trustedProxies.some((cidr) => contains(cidr, ip))
  const peerIp = parse(peer)
  if (!peerIp) return undefined
  if (!trusted(peerIp)) return format(peerIp)

  const chain = (req.header('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  let nearest = peerIp
  for (let i = chain.length - 1; i >= 0; i--) {
    const hop = parse(chain[i])
    // A trusted proxy wrote garbage: nothing further left can be believed.
    if (!hop) return format(nearest)
    if (!trusted(hop)) return format(hop)
    nearest = hop
  }
  if (chain.length === 0) {
    const real = parse(req.header('x-real-ip'))
    if (real) return format(real)
  }
  return format(nearest)
}

/**
 * The rate-limit bucket for an address. IPv6 is keyed by its /64: a single
 * subscriber is routinely handed a whole /64, and per-/128 buckets would let
 * it rotate addresses for fresh limits.
 */
export function rateLimitKey(ip: string | undefined): string {
  const parsed = parse(ip)
  if (!parsed) return 'unknown'
  if (parsed.family === 4) return format(parsed)
  const prefix = (parsed.value >> 64n) << 64n
  return `${format({ family: 6, value: prefix })}/64`
}

/** `TRUSTED_PROXIES` as a CIDR list; entries that do not parse are dropped. */
export function parseTrustedProxies(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && parse(entry.split('/')[0]) !== null)
}
