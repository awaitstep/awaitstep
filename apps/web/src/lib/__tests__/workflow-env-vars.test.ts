import { describe, expect, it } from 'vitest'
import {
  declaredEnvRows,
  groupOf,
  linkedGlobal,
  needsValue,
  rowsFromDotenv,
  summarize,
  envVarsError,
  maskedRenameError,
  missingValueError,
  parseEnvVars,
  toApiEnvVars,
} from '../workflows/env-vars'

describe('parseEnvVars', () => {
  it('names a secret with its prefix and keeps the masked value', () => {
    const json = JSON.stringify([
      { name: 'TOKEN', value: '••••••••', isSecret: true },
      { name: 'REGION', value: 'eu' },
    ])
    expect(parseEnvVars(json)).toEqual([
      { name: 'SECRET_TOKEN', value: '••••••••' },
      { name: 'REGION', value: 'eu' },
    ])
  })

  it('reads nothing, without throwing, from missing or broken text', () => {
    expect(parseEnvVars(null)).toEqual([])
    expect(parseEnvVars('{nope')).toEqual([])
    expect(parseEnvVars('{"a":1}')).toEqual([])
  })
})

describe('toApiEnvVars', () => {
  it('splits the prefix into isSecret and drops blank rows and a bare SECRET_', () => {
    expect(
      toApiEnvVars([
        { name: 'SECRET_TOKEN', value: 'x' },
        { name: '  ', value: 'orphan' },
        { name: 'SECRET_', value: 'half typed' },
        { name: 'REGION', value: 'eu' },
      ]),
    ).toEqual([
      { name: 'TOKEN', isSecret: true, value: 'x' },
      { name: 'REGION', isSecret: false, value: 'eu' },
    ])
  })

  it('round-trips a secret whose stored name already starts with SECRET_', () => {
    const rows = parseEnvVars(JSON.stringify([{ name: 'SECRET_KEY', value: 'm', isSecret: true }]))
    expect(toApiEnvVars(rows)).toEqual([{ name: 'SECRET_KEY', isSecret: true, value: 'm' }])
  })
})

describe('envVarsError', () => {
  it('accepts a clean list, blank rows included', () => {
    expect(
      envVarsError([
        { name: 'A_B1', value: '' },
        { name: '', value: '' },
      ]),
    ).toBeNull()
  })

  it('refuses a name the API would refuse', () => {
    expect(envVarsError([{ name: '1BAD', value: '' }])).toMatch(/isn’t a valid name/)
    expect(envVarsError([{ name: 'my-key', value: '' }])).toMatch(/isn’t a valid name/)
  })

  it('refuses one name used twice, even as a secret and a plain variable', () => {
    expect(
      envVarsError([
        { name: 'A', value: '' },
        { name: 'A', value: '' },
      ]),
    ).toMatch(/more than once/)
    expect(
      envVarsError([
        { name: 'SECRET_A', value: '' },
        { name: 'A', value: '' },
      ]),
    ).toMatch(/more than once/)
  })
})

describe('toApiEnvVars and a space before SECRET_', () => {
  it('still reads it as a secret instead of a plain variable', () => {
    expect(toApiEnvVars([{ name: ' SECRET_KEY', value: 'x' }])).toEqual([
      { name: 'KEY', isSecret: true, value: 'x' },
    ])
  })
})

describe('declaredEnvRows', () => {
  it('lists the names a version declares, secrets with their prefix and no values', () => {
    const ir = JSON.stringify({
      runtime: { env: [{ name: 'FOO' }, { name: 'TOKEN', secret: true }] },
    })
    expect(declaredEnvRows(ir)).toEqual([
      { name: 'FOO', value: '' },
      { name: 'SECRET_TOKEN', value: '' },
    ])
  })

  it('reads nothing from a graph with none, or from broken text', () => {
    expect(declaredEnvRows(JSON.stringify({ nodes: [] }))).toEqual([])
    expect(declaredEnvRows('{nope')).toEqual([])
    expect(declaredEnvRows(null)).toEqual([])
  })
})

describe('maskedRenameError', () => {
  const MASK = '••••••••'

  it('lets an untouched masked secret through', () => {
    expect(
      maskedRenameError([
        { name: 'SECRET_TOKEN', value: MASK, from: 'SECRET_TOKEN', group: 'secrets' as const },
      ]),
    ).toBeNull()
  })

  it('asks for the value again when a masked secret is renamed, un-secreted, or is a new row', () => {
    for (const row of [
      { name: 'SECRET_API_TOKEN', value: MASK, from: 'SECRET_TOKEN', group: 'secrets' as const },
      { name: 'TOKEN', value: MASK, from: 'SECRET_TOKEN', group: 'secrets' as const },
      { name: 'SECRET_B', value: MASK, from: null, group: 'secrets' as const },
    ]) {
      expect(maskedRenameError([row])).toMatch(/Type the value for/)
    }
  })

  it('does not mind a renamed row whose value was typed', () => {
    expect(
      maskedRenameError([
        { name: 'NEW_NAME', value: 'typed', from: 'OLD_NAME', group: 'variables' as const },
      ]),
    ).toBeNull()
  })
})

describe('groups and counts', () => {
  it('lists a named variable with no value first, then secrets, then the rest', () => {
    expect(groupOf({ name: 'WEBHOOK_URL', value: '' })).toBe('attention')
    expect(groupOf({ name: 'SECRET_STRIPE', value: '' })).toBe('attention')
    expect(groupOf({ name: 'SECRET_STRIPE', value: '••••••••' })).toBe('secrets')
    expect(groupOf({ name: 'REGION', value: 'eu' })).toBe('variables')
    expect(groupOf({ name: '', value: '' })).toBe('variables')
  })

  it('reads a global reference, and nothing else, as a link', () => {
    expect(linkedGlobal('{{global.env.API_BASE}}')).toBe('API_BASE')
    expect(linkedGlobal(' {{global.env.API_BASE}} ')).toBe('API_BASE')
    expect(linkedGlobal('https://{{global.env.HOST}}')).toBeNull()
    expect(linkedGlobal('{{global.env.lower}}')).toBeNull()
    expect(needsValue({ name: 'A', value: '  ' })).toBe(true)
    expect(needsValue({ name: '', value: '' })).toBe(false)
  })

  it('counts encrypted, linked and missing over named rows only', () => {
    expect(
      summarize([
        { name: 'SECRET_A', value: 'x' },
        { name: 'B', value: '{{global.env.B}}' },
        { name: 'C', value: '' },
        { name: '', value: '' },
      ]),
    ).toEqual({ total: 3, secrets: 1, linked: 1, missing: 1 })
  })
})

describe('rowsFromDotenv', () => {
  it('adds the lines that parse, secrets with their prefix, and counts what it left out', () => {
    const text = '# comment\nREGION=eu\nSECRET_KEY=abc\nTAKEN=1\nnot a line\nbad-name=2\n'
    const result = rowsFromDotenv(text, ['TAKEN'])
    expect(result.rows).toEqual([
      { name: 'REGION', value: 'eu' },
      { name: 'SECRET_KEY', value: 'abc' },
    ])
    expect(result.present).toBe(1)
    expect(result.invalid).toBe(2)
  })

  it('does not add one name twice, even as a secret and a plain variable', () => {
    const result = rowsFromDotenv('A=1\nSECRET_A=2\n', [])
    expect(result.rows).toHaveLength(1)
    expect(result.present).toBe(1)
  })
})

describe('missingValueError', () => {
  it('refuses a named variable whose value is empty once trimmed', () => {
    expect(missingValueError([{ name: 'SOME', value: '' }])).toMatch(/“SOME” needs a value/)
    expect(missingValueError([{ name: 'SOME', value: '   ' }])).toMatch(/“SOME” needs a value/)
  })

  it('accepts a value, a stored secret’s mask, a global link, and a blank row without a name', () => {
    expect(
      missingValueError([
        { name: 'A', value: 'x' },
        { name: 'SECRET_B', value: '••••••••' },
        { name: 'C', value: '{{global.env.C}}' },
        { name: '', value: '' },
      ]),
    ).toBeNull()
  })
})
