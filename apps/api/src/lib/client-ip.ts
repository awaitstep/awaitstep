/**
 * Who the client is — the key for every rate limit and the address recorded
 * on sessions.
 *
 * A forwarding header is a claim, and only a trusted hop may make one. Trust
 * is never inferred from an address the request came from: user workflow
 * code runs on the same host (Node test sessions, local dev) and reaches the
 * API from loopback or the container network like any proxy would.
 *
 * - `edge` (Workers): Cloudflare's edge writes `cf-connecting-ip` on every
 *   request and no client can set it.
 * - `proxied` (Node): a hop proves itself with a secret in
 *   `X-AwaitStep-Proxy` and names the client in `X-AwaitStep-Client`. The
 *   web server does this for its own SSR calls with a per-process secret;
 *   a self-managed reverse proxy does it with `TRUSTED_PROXY_SECRET`. For
 *   managed platforms whose load balancers cannot add headers,
 *   `TRUSTED_PROXIES` opts their address ranges into `X-Forwarded-For`.
 *   Everyone else is keyed on their own connection.
 */
export type ClientIpPolicy =
  | { mode: 'edge'; header: string }
  | {
      mode: 'proxied'
      proxySecrets: readonly string[]
      trustedProxies: readonly string[]
    }

/** A trusted hop's proof — a secret only the hop and the API know. */
export const PROXY_SECRET_HEADER = 'x-awaitstep-proxy'
/** The client a trusted hop resolved. Ignored without a valid secret. */
export const PROXY_CLIENT_HEADER = 'x-awaitstep-client'
/**
 * The header the API hands better-auth the resolved address in. Overwritten
 * on every request before better-auth sees it.
 */
export const CLIENT_IP_HEADER = 'x-awaitstep-client-ip'

/** Shortest `TRUSTED_PROXY_SECRET` accepted — guessable secrets are no proof. */
export const MIN_PROXY_SECRET_LENGTH = 32

interface HeaderSource {
  header: (name: string) => string | undefined
}

type Parsed = { family: 4; value: number } | { family: 6; value: bigint }

interface Network {
  family: 4 | 6
  value: number | bigint
  bits: number
}

/** A policy prepared once at startup: CIDRs parsed, secrets ready to compare. */
export type CompiledClientIpPolicy =
  | { mode: 'edge'; header: string }
  | { mode: 'proxied'; proxySecrets: readonly string[]; networks: readonly Network[] }

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
  if (head.includes('.')) {
    const lastColon = head.lastIndexOf(':')
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

// Some proxies and load balancers write `ip:port`, or `[v6]:port`.
function withoutPort(text: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(text)
  if (bracketed) return bracketed[1]!
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(text)
  if (v4WithPort) return v4WithPort[1]!
  return text
}

function parse(raw: string | undefined): Parsed | null {
  if (!raw) return null
  const text = withoutPort(raw.trim()).split('%')[0]!
  if (text === '') return null
  const v4 = parseIPv4(text)
  if (v4 !== null) return { family: 4, value: v4 }
  const v6 = parseIPv6(text)
  if (v6 === null) return null
  // `::ffff:a.b.c.d` is an IPv4 client on a dual-stack socket: one client,
  // one key, whichever way the socket reported it.
  if (v6 >> 32n === 0xffffn) return { family: 4, value: Number(v6 & 0xffffffffn) }
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

function parseNetwork(cidr: string): Network | null {
  const [base, bitsText, extra] = cidr.trim().split('/')
  if (extra !== undefined) return null
  const address = parse(base)
  if (!address) return null
  const width = address.family === 4 ? 32 : 128
  const bits = bitsText === undefined ? width : Number(bitsText)
  if (bitsText !== undefined && !/^\d+$/.test(bitsText)) return null
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return null
  return { family: address.family, value: address.value, bits }
}

function inNetwork(network: Network, ip: Parsed): boolean {
  if (network.family !== ip.family) return false
  if (ip.family === 4) {
    const mask = network.bits === 0 ? 0 : (0xffffffff << (32 - network.bits)) >>> 0
    return (ip.value & mask) >>> 0 === ((network.value as number) & mask) >>> 0
  }
  const shift = BigInt(128 - network.bits)
  return ip.value >> shift === (network.value as bigint) >> shift
}

// Compared in full whatever the content, so the time taken says nothing
// about how much of a guess was right.
function sameSecret(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length
  for (let i = 0; i < expected.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Validates a policy and prepares it for the hot path. Throws on an invalid
 * trusted-proxy entry or a short secret: a typo there would silently leave
 * every user sharing the proxy's rate limits, so startup refuses instead.
 */
export function compileClientIpPolicy(policy: ClientIpPolicy): CompiledClientIpPolicy {
  if (policy.mode === 'edge') return policy
  const networks = policy.trustedProxies.map((cidr) => {
    const network = parseNetwork(cidr)
    if (!network) throw new Error(`TRUSTED_PROXIES: "${cidr}" is not an IP address or CIDR range`)
    return network
  })
  for (const secret of policy.proxySecrets) {
    if (secret.length < MIN_PROXY_SECRET_LENGTH) {
      throw new Error(
        `TRUSTED_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters (generate one with: openssl rand -hex 32)`,
      )
    }
  }
  return { mode: 'proxied', proxySecrets: policy.proxySecrets, networks }
}

/**
 * The client's address under `policy`, or undefined when nothing names one.
 *
 * `proxied`: a request carrying a valid proxy secret is a trusted hop, and
 * its `X-AwaitStep-Client` is the client. Otherwise, a TCP peer inside a
 * `TRUSTED_PROXIES` range forwarded the request, so `X-Forwarded-For` is
 * read from the right — each proxy appends the address it saw — skipping
 * trusted hops; the first untrusted entry is the client. Anyone else is the
 * client themselves.
 */
export function resolveClientIp(
  req: HeaderSource,
  peer: string | undefined,
  policy: CompiledClientIpPolicy,
): string | undefined {
  if (policy.mode === 'edge') {
    const ip = parse(req.header(policy.header))
    return ip ? format(ip) : undefined
  }

  const proof = req.header(PROXY_SECRET_HEADER)
  if (proof && policy.proxySecrets.some((secret) => sameSecret(proof, secret))) {
    // The proof is what matters; where the address rides depends on what the
    // proxy can write. Some (Traefik's static header middleware) can add the
    // secret but not a computed header, and set X-Real-IP / X-Forwarded-For
    // themselves — the rightmost entry is the one this proven hop appended.
    const lastForwarded = (req.header('x-forwarded-for') ?? '').split(',').pop()
    const named =
      parse(req.header(PROXY_CLIENT_HEADER)) ??
      parse(req.header('x-real-ip')) ??
      parse(lastForwarded)
    return named ? format(named) : undefined
  }

  const peerIp = parse(peer)
  if (!peerIp) return undefined
  const trusted = (ip: Parsed) => policy.networks.some((network) => inNetwork(network, ip))
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

/** `TRUSTED_PROXIES` as a list; validation happens in compileClientIpPolicy. */
export function parseTrustedProxies(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

export type ProxiedClientIpPolicy = Extract<ClientIpPolicy, { mode: 'proxied' }>

/** The Node entries' policy, from `TRUSTED_PROXY_SECRET` and `TRUSTED_PROXIES`. */
export function clientIpPolicyFromEnv(
  env: Record<string, string | undefined>,
): ProxiedClientIpPolicy {
  const secret = env['TRUSTED_PROXY_SECRET']
  return {
    mode: 'proxied',
    proxySecrets: secret ? [secret] : [],
    trustedProxies: parseTrustedProxies(env['TRUSTED_PROXIES']),
  }
}

/**
 * True when a request names a client in a forwarding header that `policy`
 * will not believe — no valid proof, peer outside `TRUSTED_PROXIES`. On a
 * deployment behind a proxy that was never given `TRUSTED_PROXY_SECRET`,
 * every request looks like this, and every user shares one rate limit.
 */
export function ignoresForwarding(
  req: HeaderSource,
  peer: string | undefined,
  policy: CompiledClientIpPolicy,
): boolean {
  if (policy.mode === 'edge') return false
  if (!req.header('x-forwarded-for') && !req.header('x-real-ip')) return false
  const proof = req.header(PROXY_SECRET_HEADER)
  if (proof && policy.proxySecrets.some((secret) => sameSecret(proof, secret))) return false
  const peerIp = parse(peer)
  return !peerIp || !policy.networks.some((network) => inNetwork(network, peerIp))
}

/**
 * The headers to hand better-auth: the caller's own copy of
 * `CLIENT_IP_HEADER` dropped, the resolved address in its place. Every call
 * into better-auth goes through this — it reads that header for its rate
 * limits and session records, and a client must never get to set it.
 */
export function headersForAuth(raw: Headers, clientIp: string | undefined): Headers {
  const headers = new Headers(raw)
  headers.delete(CLIENT_IP_HEADER)
  if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp)
  return headers
}
