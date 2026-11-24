import type { OssFeature } from '@awaitstep/ir'
import { create } from 'zustand'
import type { InstanceInfo } from '../extensions/instance-features'
import { setRunAddress } from '../lib/workflows/run-endpoint'

interface InstanceState {
  /** Ids of the extensions the API instance turns on (`GET /api/instance`). */
  features: readonly string[]
  /** The open-source features the API instance switches off (`GET /api/instance`). */
  disabled: readonly OssFeature[]
  /** Where other systems run a workflow, when the instance names another address. */
  runUrl?: string
  setInstance: (instance: InstanceInfo) => void
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  features: [],
  disabled: [],
  setInstance: ({ features, disabled, runUrl }) => {
    // The layout hands over the same loader data on every render: no change, no update.
    setRunAddress(runUrl)
    const current = get()
    const next: Partial<InstanceState> = {}
    if (!sameList(current.features, features)) next.features = features
    if (!sameList(current.disabled, disabled)) next.disabled = disabled
    if (current.runUrl !== runUrl) next.runUrl = runUrl
    if (next.features || next.disabled || 'runUrl' in next) set(next)
  },
}))
