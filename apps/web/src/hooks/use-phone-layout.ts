import { useSyncExternalStore } from 'react'
import { isPhoneLayout, PHONE_LAYOUT_BELOW_PX } from '../lib/phone-layout'

const QUERY = `(min-width: ${PHONE_LAYOUT_BELOW_PX}px)`

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return isPhoneLayout()
}

function getServerSnapshot(): boolean {
  return false
}

/** Whether the dashboard shows its phone layout (below `md`), following resizes. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
