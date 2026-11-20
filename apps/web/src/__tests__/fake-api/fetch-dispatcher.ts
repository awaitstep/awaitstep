// better-auth's client keeps the `fetch` it finds when `lib/auth-client`
// loads, so replacing `globalThis.fetch` inside a test never reaches it. The
// DOM setup installs this dispatcher before any app module loads; the fake API
// points it at itself for one test, and otherwise it passes calls through.

type Fetch = typeof globalThis.fetch

const INSTALLED = Symbol.for('awaitstep.fake-api.dispatcher')

let target: Fetch | null = null

export function installFetchDispatcher(): void {
  const current = globalThis.fetch as Fetch & { [INSTALLED]?: true }
  if (current[INSTALLED]) return
  const passThrough = current
  const dispatch = ((input, init) => (target ?? passThrough)(input, init)) as Fetch & {
    [INSTALLED]?: true
  }
  dispatch[INSTALLED] = true
  globalThis.fetch = dispatch
}

/** Sends every `fetch` (better-auth's included) to `handler`; null passes them through again. */
export function routeFetchTo(handler: Fetch | null): void {
  target = handler
}
