import { describe, expect, it } from 'vitest'
import { computeEnvVarOps } from '../env-var-diff'
import { MASKED_SECRET_VALUE } from '../env-var-parser'
import type { EnvVarSummary } from '../api-client'

function envVar(overrides: Partial<EnvVarSummary> & { id: string; name: string }): EnvVarSummary {
  return { value: '', isSecret: false, ...overrides } as EnvVarSummary
}

function line(name: string, value: string, isSecret = false) {
  return { name, value, isSecret }
}

describe('computeEnvVarOps', () => {
  it('deletes variables missing from the editor', () => {
    const result = computeEnvVarOps([envVar({ id: 'a', name: 'FOO', value: '1' })], [])
    expect(result).toEqual({ ok: true, ops: [{ type: 'delete', id: 'a' }] })
  })

  it('creates new variables', () => {
    const result = computeEnvVarOps([], [line('FOO', 'bar')])
    expect(result).toEqual({
      ok: true,
      ops: [{ type: 'create', name: 'FOO', value: 'bar', isSecret: false }],
    })
  })

  it('updates a changed value', () => {
    const result = computeEnvVarOps(
      [envVar({ id: 'a', name: 'FOO', value: 'old' })],
      [line('FOO', 'new')],
    )
    expect(result).toEqual({
      ok: true,
      ops: [{ type: 'update', id: 'a', updates: { value: 'new' } }],
    })
  })

  it('emits nothing when values are unchanged', () => {
    const result = computeEnvVarOps(
      [envVar({ id: 'a', name: 'FOO', value: 'same' })],
      [line('FOO', 'same')],
    )
    expect(result).toEqual({ ok: true, ops: [] })
  })

  it('treats a masked value on an existing secret as unchanged', () => {
    const result = computeEnvVarOps(
      [envVar({ id: 'a', name: 'KEY', value: 'real', isSecret: true })],
      [line('KEY', MASKED_SECRET_VALUE, true)],
    )
    expect(result).toEqual({ ok: true, ops: [] })
  })

  it('updates the isSecret flag without touching a masked value', () => {
    const result = computeEnvVarOps(
      [envVar({ id: 'a', name: 'KEY', value: 'real', isSecret: true })],
      [line('KEY', MASKED_SECRET_VALUE, false)],
    )
    expect(result).toEqual({
      ok: true,
      ops: [{ type: 'update', id: 'a', updates: { isSecret: false } }],
    })
  })

  it('rejects a new variable with a masked or empty value', () => {
    expect(computeEnvVarOps([], [line('NEW', MASKED_SECRET_VALUE, true)])).toEqual({
      ok: false,
      error: 'New variable NEW needs a value',
    })
    expect(computeEnvVarOps([], [line('NEW', '')])).toEqual({
      ok: false,
      error: 'New variable NEW needs a value',
    })
  })

  it('skips lines without a name', () => {
    expect(computeEnvVarOps([], [line('', 'value')])).toEqual({ ok: true, ops: [] })
  })

  it('orders deletes before creates and updates', () => {
    const result = computeEnvVarOps(
      [envVar({ id: 'a', name: 'OLD', value: '1' })],
      [line('NEW', '2')],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ops.map((op) => op.type)).toEqual(['delete', 'create'])
    }
  })
})
