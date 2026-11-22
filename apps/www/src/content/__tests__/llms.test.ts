import { describe, expect, it } from 'vitest'
import { llmsText } from '../llms'

describe('llmsText', () => {
  const text = llmsText(new URL('https://awaitstep.dev'))

  it('opens with the name and a one-paragraph summary', () => {
    expect(text.startsWith('# AwaitStep\n\n> ')).toBe(true)
  })

  it('links every page by its canonical URL, with no trailing slash', () => {
    for (const path of ['use-cases', 'integrations', 'pricing', 'changelog']) {
      expect(text).toContain(`(https://awaitstep.dev/${path})`)
    }
  })
})
