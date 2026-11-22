import { lookup, type LookupAddress } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

/** Addresses a self-hosted server must not be pointed at by a host a user named. */
const PRIVATE = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  // `::`, `::1` and the IPv4-compatible `::a.b.c.d` forms.
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  // Teredo and 6to4 tunnel to an IPv4 address that isn't checked here.
  ['2001::', 32],
  ['2002::', 16],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv6')
}

/** Whether an address is loopback, private, link-local or otherwise not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return PRIVATE.check(address, 'ipv4')
  if (family !== 6) return true
  // An IPv4 address written as IPv6 (`::ffff:10.0.0.1`) is judged as the IPv4 one.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return PRIVATE.check(mapped[1]!, 'ipv4')
  return PRIVATE.check(address, 'ipv6')
}

export class PrivateAddressError extends Error {
  constructor(hostname: string) {
    super(`${hostname} resolves to a private address`)
    this.name = 'PrivateAddressError'
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

/**
 * Resolves as `dns.lookup` does, failing when any address is private. It runs
 * at connect time, for the address the socket then uses, so a name that
 * changes its answer between a check and the request can't slip past.
 */
function publicLookup(
  hostname: string,
  options: { all?: boolean; family?: number | string },
  callback: LookupCallback,
): void {
  lookup(hostname, { ...options, all: true } as { all: true }, (err, addresses) => {
    if (err) return callback(err, [])
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new PrivateAddressError(hostname), [])
    }
    if (options.all) return callback(null, addresses)
    const first = addresses[0]!
    callback(null, first.address, first.family)
  })
}

const agent = new Agent({ connect: { lookup: publicLookup } })

/**
 * The fetch the self-hosted server calls hosts a user named with (a
 * deployment's route or custom domain): it refuses any that resolve to a
 * private address. A Worker has no such network to reach, so its entry
 * leaves this out.
 */
export const publicFetch: typeof fetch = (input, init) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: agent,
  }) as unknown as Promise<Response>
