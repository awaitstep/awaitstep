import { describe, it, expect } from 'vitest'
import { stepLabel, sanitizeStepLabel, derivedStepLabel, maskStepLabels } from '../naming.js'

describe('stepLabel', () => {
  it('leads with the node name and keeps the id in brackets', () => {
    expect(stepLabel({ id: 'Mn6a_STiAD3FDtVmpgFvu', name: 'Send welcome email' })).toBe(
      'Send welcome email (Mn6a_STiAD3FDtVmpgFvu)',
    )
  })

  it('drops characters that would break the generated string or the id tail', () => {
    expect(stepLabel({ id: 's1', name: 'Say "hi" \\ `${x}` (draft) [2]' })).toBe(
      'Say hi x draft 2 (s1)',
    )
    expect(stepLabel({ id: 's1', name: 'two\nlines\there' })).toBe('two lines here (s1)')
  })

  it('keeps names in other scripts', () => {
    expect(stepLabel({ id: 's1', name: 'Café — 注文' })).toBe('Café 注文 (s1)')
  })

  it('caps long names so the label stays within provider limits', () => {
    const label = stepLabel({ id: 's1', name: 'x'.repeat(300) })
    expect(label).toBe(`${'x'.repeat(80)} (s1)`)
  })

  it('labels with the id alone when the name has nothing usable', () => {
    expect(stepLabel({ id: 's1', name: '' })).toBe('s1')
    expect(stepLabel({ id: 's1', name: '"()"' })).toBe('s1')
  })

  it('uses the node id verbatim when there is no name', () => {
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
    expect(derivedStepLabel({ id: 'wf-1', name: 'Child run' }, 'create')).toBe(
      'Child run (wf-1)--create',
    )
  })
})

describe('maskStepLabels', () => {
  it('blanks the text of every emitted label literal and keeps the length', () => {
    const code = [
      'const fetch_user = await flow.step("fetch_user (a)", () => 1);',
      'await flow.sleep("nap (b)", 1000);',
      'const w = await waitForEventOrTimeout(flow, "wait (c)", {});',
      'await flow.step(`loop body (d) [${_loop_i}]`, () => fetch_user);',
    ].join('\n')
    const masked = maskStepLabels(code)
    expect(masked).toHaveLength(code.length)
    expect(masked.match(/\bfetch_user\b/g)).toHaveLength(2)
    expect(masked).not.toMatch(/nap|wait \(|loop body/)
  })

  it('leaves other strings alone', () => {
    const code = 'await flow.http("fetch_user (a)")'
    expect(maskStepLabels(code)).toBe(code)
  })
})
