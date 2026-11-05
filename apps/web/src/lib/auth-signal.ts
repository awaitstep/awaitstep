// Sign-out and account deletion happen in one tab; every other tab of the app
// keeps running with its own in-memory state and its own write timers. This is
// how they find out: a BroadcastChannel where the browser has one, and
// otherwise a `storage` event on a throwaway key (which only fires in the
// OTHER tabs).

const CHANNEL = 'awaitstep-auth'
const FALLBACK_KEY = 'awaitstep-signed-out'
const SIGNED_OUT = 'signed-out'

type Listener = () => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null
let attached = false

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // One listener failing must not stop the others forgetting.
    }
  }
}

function attach(): void {
  if (attached || typeof window === 'undefined') return
  attached = true
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (event: MessageEvent) => {
        if (event.data === SIGNED_OUT) notify()
      }
    }
  } catch {
    channel = null
  }
  // Always listen on storage too: it costs nothing and covers a browser whose
  // BroadcastChannel is missing or blocked in only some of the tabs.
  window.addEventListener('storage', (event) => {
    if (event.key === FALLBACK_KEY && event.newValue) notify()
  })
}

/** Runs `listener` when ANOTHER tab signs out or deletes the account. Returns an unsubscribe. */
export function onSignedOutElsewhere(listener: Listener): () => void {
  attach()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tells every other tab of the app that the person is gone. */
export function announceSignOut(): void {
  if (typeof window === 'undefined') return
  attach()
  try {
    channel?.postMessage(SIGNED_OUT)
  } catch {
    // Fall through to the storage signal.
  }
  try {
    window.localStorage.setItem(FALLBACK_KEY, String(Date.now()))
    window.localStorage.removeItem(FALLBACK_KEY)
  } catch {
    // Storage blocked: the channel (if any) has already been told.
  }
}
