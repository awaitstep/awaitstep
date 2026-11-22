import { describe, expect, it } from 'vitest'
import { FAQ } from '../home'
import { pricingFaq, PRICING_PAGE } from '../pricing'

describe('pricingFaq', () => {
  it('finds every question the pricing page repeats, in its order', () => {
    expect(pricingFaq().map((f) => f.id)).toEqual(PRICING_PAGE.faqIds)
  })

  it('fails the build when a picked question is gone, rather than showing an empty FAQ', () => {
    expect(() => pricingFaq(FAQ.filter((f) => f.id !== 'clouds'))).toThrow(/clouds/)
  })

  it('gives every home question its own id', () => {
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(FAQ.length)
  })
})
