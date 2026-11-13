import { describe, expect, it } from 'vitest'
import type { ConfigField } from '../node-definition.js'
import { missingRequiredFields } from '../required-fields.js'

const schema: Record<string, ConfigField> = {
  action: { type: 'select', label: 'Action', required: true, options: ['a'] },
  message: { type: 'textarea', label: 'Message', required: true },
  count: { type: 'number', label: 'Count', required: true },
  enabled: { type: 'boolean', label: 'Enabled', required: true },
  tags: { type: 'multiselect', label: 'Tags', required: true, options: ['x'] },
  apiKey: { type: 'secret', label: 'API key', required: true, envVarName: 'API_KEY' },
  token: { type: 'secret', label: 'Token', required: true },
  note: { type: 'string', label: 'Note' },
}

describe('missingRequiredFields', () => {
  it('lists empty required fields in schema order', () => {
    expect(missingRequiredFields(schema, { message: '   ', tags: [], token: null })).toEqual([
      'action',
      'message',
      'count',
      'enabled',
      'tags',
    ])
  })

  it('counts 0, false and a chosen value as filled', () => {
    expect(
      missingRequiredFields(schema, {
        action: 'a',
        message: 'hi',
        count: 0,
        enabled: false,
        tags: ['x'],
        token: '{{env.TOKEN}}',
      }),
    ).toEqual([])
  })

  it('never asks for a secret (it comes from the environment) or an optional field', () => {
    const missing = missingRequiredFields(schema, {})
    expect(missing).not.toContain('apiKey')
    expect(missing).not.toContain('token')
    expect(missing).not.toContain('note')
  })

  it('reads only the node’s own fields, not inherited ones', () => {
    const named = {
      toString: { type: 'string', label: 'To string', required: true },
      constructor: { type: 'string', label: 'Constructor', required: true },
    } as Record<string, ConfigField>
    expect(missingRequiredFields(named, {})).toEqual(['toString', 'constructor'])
  })

  it('has nothing to ask without a schema', () => {
    expect(missingRequiredFields(undefined, {})).toEqual([])
  })
})
