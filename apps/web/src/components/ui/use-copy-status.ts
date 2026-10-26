import { useState } from 'react'
import { copyToClipboard } from '../../lib/utils'

export type CopyStatus = 'idle' | 'copied' | 'failed'

/**
 * Copy-to-clipboard state for one value. The status belongs to the value it
 * was set for, so a new value (a regenerated key, a retry's new error ID)
 * reads `idle` again instead of a stale "Copied".
 */
export function useCopyStatus(value: string | undefined): {
  status: CopyStatus
  copy: () => Promise<boolean>
} {
  const [result, setResult] = useState<{ value: string; status: CopyStatus } | null>(null)
  const status = result !== null && result.value === value ? result.status : 'idle'

  async function copy(): Promise<boolean> {
    if (value === undefined) return false
    try {
      await copyToClipboard(value)
      setResult({ value, status: 'copied' })
      return true
    } catch {
      setResult({ value, status: 'failed' })
      return false
    }
  }

  return { status, copy }
}
