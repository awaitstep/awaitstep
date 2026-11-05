import { onSignedOutElsewhere } from '../lib/auth-signal'
import { DRAFT_RETENTION_MS } from '../lib/ide/draft-persistence'
import { strictBrowserStorage } from './ssr-safe-storage'

/** Storage keys of the stores that remember what a person typed to test with (they can hold tokens). */
export const TEST_SESSION_STORAGE_KEY = 'awaitstep-test-session'
export const QUICK_TEST_STORAGE_KEY = 'awaitstep-quick-test'
const KEYS = [TEST_SESSION_STORAGE_KEY, QUICK_TEST_STORAGE_KEY]

let writesSuspended = false
/** True while a wipe runs, so clearing the in-memory slices does not write them back. */
let wiping = false
/** The signed-in user's id once known; what remembered values must belong to. */
let currentOwner: string | null = null
const wipers = new Set<() => void>()

/** Who remembered the values and when: stored beside them so a later person never inherits them. */
export interface RememberedEnvelope {
  owner: string | null
  savedAt: number
}

/** Added to what each store persists. */
export function rememberedEnvelope(): RememberedEnvelope {
  return { owner: currentOwner, savedAt: Date.now() }
}

/**
 * Whether stored state may be used. Data with no owner (written before
 * owners existed), another person's, or older than the draft retention is
 * not. While the user is not yet known only the shape and age can be judged;
 * `reconcileRememberedOwner` judges again once the id arrives.
 */
export function isRememberedStateUsable(persisted: unknown, now = Date.now()): boolean {
  if (typeof persisted !== 'object' || persisted === null) return false
  const { owner, savedAt } = persisted as Partial<RememberedEnvelope>
  if (typeof owner !== 'string' || owner === '') return false
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false
  if (now - savedAt > DRAFT_RETENTION_MS) return false
  return currentOwner === null || owner === currentOwner
}

/** Lets a store empty its in-memory remembered slices when the remembered values are forgotten. */
export function registerRememberedWiper(wiper: () => void): void {
  wipers.add(wiper)
}

/** The browser storage those two stores persist to; stops writing once inputs are forgotten. */
export function rememberedInputsStorage(): Storage {
  const storage = strictBrowserStorage()
  return {
    get length() {
      return storage.length
    },
    clear: () => storage.clear(),
    getItem: (key) => storage.getItem(key),
    key: (index) => storage.key(index),
    removeItem: (key) => storage.removeItem(key),
    setItem: (key, value) => {
      if (!writesSuspended && !wiping) storage.setItem(key, value)
    },
  }
}

function wipeRemembered(): void {
  wiping = true
  try {
    for (const wiper of wipers) wiper()
    const storage = strictBrowserStorage()
    for (const key of KEYS) storage.removeItem(key)
  } finally {
    wiping = false
  }
}

/**
 * Sign-out and account deletion: payloads and Quick test arguments must not
 * outlive the account that typed them. Writes stop first, so a state change
 * still in flight cannot put back what is removed. Runs in every tab (see
 * the signal below) because each tab holds its own copy and its own writers.
 */
export function forgetRememberedInputs(): void {
  writesSuspended = true
  wipeRemembered()
}

/**
 * The signed-in user is known (or changed). A different person than the one
 * who remembered the values, values past the retention, and values from
 * before owners were recorded are all removed, in storage and in memory.
 */
export function reconcileRememberedOwner(userId: string): void {
  if (writesSuspended) return
  const previous = currentOwner
  currentOwner = userId
  if (previous !== null && previous !== userId) {
    wipeRemembered()
    return
  }
  const storage = strictBrowserStorage()
  const stale = KEYS.some((key) => {
    const raw = storage.getItem(key)
    if (raw === null) return false
    try {
      const parsed = JSON.parse(raw) as { state?: unknown }
      return !isRememberedStateUsable(parsed?.state)
    } catch {
      return true
    }
  })
  if (stale) wipeRemembered()
}

// Another tab signed out: this one must stop writing and drop what it holds.
onSignedOutElsewhere(forgetRememberedInputs)
