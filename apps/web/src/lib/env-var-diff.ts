import type { EnvVarSummary } from './api-client'
import { MASKED_SECRET_VALUE, type ParsedLine } from './env-var-parser'

export type EnvVarOp =
  | { type: 'delete'; id: string }
  | { type: 'update'; id: string; updates: { value?: string; isSecret?: boolean } }
  | { type: 'create'; name: string; value: string; isSecret: boolean }

export type EnvVarDiffResult = { ok: true; ops: EnvVarOp[] } | { ok: false; error: string }

/**
 * Diff the parsed editor contents against the server state into a list of
 * create/update/delete operations. A masked or empty value on an existing
 * secret means "unchanged"; on a new variable it is an error.
 */
export function computeEnvVarOps(
  existing: EnvVarSummary[],
  parsed: ParsedLine[],
): EnvVarDiffResult {
  const existingByName = new Map(existing.map((v) => [v.name, v]))
  const parsedNames = new Set(parsed.map((p) => p.name))
  const ops: EnvVarOp[] = []

  for (const v of existing) {
    if (!parsedNames.has(v.name)) ops.push({ type: 'delete', id: v.id })
  }

  for (const line of parsed) {
    if (!line.name) continue
    const current = existingByName.get(line.name)
    const isUnchangedSecret = line.value === MASKED_SECRET_VALUE || line.value === ''

    if (current) {
      const updates: { value?: string; isSecret?: boolean } = {}
      if (!isUnchangedSecret && line.value !== current.value) updates.value = line.value
      if (line.isSecret !== current.isSecret) updates.isSecret = line.isSecret
      if (Object.keys(updates).length > 0) ops.push({ type: 'update', id: current.id, updates })
    } else {
      if (isUnchangedSecret) return { ok: false, error: `New variable ${line.name} needs a value` }
      ops.push({ type: 'create', name: line.name, value: line.value, isSecret: line.isSecret })
    }
  }

  return { ok: true, ops }
}
