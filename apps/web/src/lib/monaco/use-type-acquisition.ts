import { useEffect, useMemo, useState } from 'react'
import { useMonaco } from '@monaco-editor/react'
import { languageHosts } from './setup'
import { planAcquisition, type AcquisitionPlan } from './type-acquisition'
import { TypeLibRegistry } from './type-registry'

// One registry per session: declarations are shared by every workspace.
const registry = new TypeLibRegistry((url) => fetch(url))

/**
 * Keeps the language services supplied with declarations for every npm
 * package the project imports. Returns true once every package in view
 * has been handled — typed, stubbed, or given up on — which is when
 * unresolved-import errors become meaningful instead of a flash of red
 * while types are in flight. Pass a settled (debounced) file map: the
 * scan is project-wide.
 */
export function useTypeAcquisition(files: ReadonlyMap<string, { source: string }>): boolean {
  const monaco = useMonaco()
  const next = useMemo(() => planAcquisition(files), [files])
  // The plan only changes identity when its package set changes, so edits
  // that leave the imports alone never re-run the effect.
  const [plan, setPlan] = useState<AcquisitionPlan>(next)
  if (plan.key !== next.key) setPlan(next)
  const [settledKey, setSettledKey] = useState<string | null>(null)

  useEffect(() => {
    if (!monaco) return
    let cancelled = false
    const hosts = languageHosts(monaco)
    void registry.ensure(plan.specs, [hosts.typescript, hosts.javascript]).then(() => {
      if (!cancelled) setSettledKey(plan.key)
    })
    return () => {
      cancelled = true
    }
  }, [monaco, plan])

  return settledKey === plan.key
}
