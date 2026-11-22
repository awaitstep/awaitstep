import { describe, expect, it } from 'vitest'
import { matchesFilter } from '../filter'

const stripe = { category: 'Payments', keywords: 'stripe payments billing charges' }

describe('matchesFilter', () => {
  it('passes everything with no query and no category', () => {
    expect(matchesFilter(stripe, '', '')).toBe(true)
  })

  it('keeps only the chosen category', () => {
    expect(matchesFilter(stripe, '', 'Payments')).toBe(true)
    expect(matchesFilter(stripe, '', 'Email')).toBe(false)
  })

  it('matches every word of the query, in any order and case', () => {
    expect(matchesFilter(stripe, 'BILLING stripe', '')).toBe(true)
    expect(matchesFilter(stripe, 'stripe email', '')).toBe(false)
  })

  it('ignores extra spaces in the query', () => {
    expect(matchesFilter(stripe, '  stripe   ', '')).toBe(true)
  })

  it('needs both the category and the query to match', () => {
    expect(matchesFilter(stripe, 'stripe', 'Email')).toBe(false)
  })

  it('matches the start of a keyword, never the middle of one', () => {
    const resend = { category: 'Email', keywords: 'resend email transactional' }
    expect(matchesFilter(resend, 'ai', '')).toBe(false)
    expect(matchesFilter(resend, 'trans', '')).toBe(true)
    expect(matchesFilter({ category: 'AI', keywords: 'openai ai models' }, 'ai', '')).toBe(true)
  })

  it('reads a hyphenated query as its words', () => {
    expect(
      matchesFilter({ category: 'AI', keywords: 'google gemini ai' }, 'google-gemini', ''),
    ).toBe(true)
  })
})
