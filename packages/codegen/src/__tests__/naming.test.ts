import { describe, it, expect } from 'vitest'
import { stepLabel, sanitizeStepLabel, derivedStepLabel } from '../naming.js'

describe('stepLabel', () => {
  it('uses the node id verbatim so labels survive renames', () => {
    expect(stepLabel({ id: 'Mn6a_STiAD3FDtVmpgFvu' })).toBe('Mn6a_STiAD3FDtVmpgFvu')
    expect(stepLabel({ id: 'step-1' })).toBe('step-1')
  })

  it('sanitizes ids that fall outside the safe label charset', () => {
    expect(stepLabel({ id: 'a b"c' })).toBe('a-b-c')
  })
})

describe('sanitizeStepLabel', () => {
  it('collapses runs of invalid characters to single hyphens', () => {
    expect(sanitizeStepLabel('Send  email!!')).toBe('Send-email')
  })

  it('trims leading and trailing separators', () => {
    expect(sanitizeStepLabel('  padded  ')).toBe('padded')
  })

  it('falls back to a non-empty label when nothing survives', () => {
    expect(sanitizeStepLabel('!!!')).toBe('step')
  })
})

describe('derivedStepLabel', () => {
  it('appends a sanitized suffix with a double-hyphen separator', () => {
    expect(derivedStepLabel({ id: 'wf-1' }, 'create')).toBe('wf-1--create')
    expect(derivedStepLabel({ id: 'wf-1' }, 'await result')).toBe('wf-1--await-result')
  })
})
