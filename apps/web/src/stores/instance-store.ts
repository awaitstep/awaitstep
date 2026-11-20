import type { OssFeature } from '@awaitstep/ir'
import { create } from 'zustand'
import type { InstanceInfo } from '../extensions/instance-features'

interface InstanceState {
  /** Ids of the extensions the API instance turns on (`GET /api/instance`). */
  features: readonly string[]
  /** The open-source features the API instance switches off (`GET /api/instance`). */
  disabled: readonly OssFeature[]
  setInstance: (instance: InstanceInfo) => void
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  features: [],
  disabled: [],
  setInstance: ({ features, disabled }) => {
    // The layout hands over the same loader data on every render: no change, no update.
    const current = get()
    const next: Partial<InstanceState> = {}
    if (!sameList(current.features, features)) next.features = features
    if (!sameList(current.disabled, disabled)) next.disabled = disabled
    if (next.features || next.disabled) set(next)
  },
}))
