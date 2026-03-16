import { describe, it, expect } from 'vitest'
import type { StepConfig } from '@awaitstep/ir'
import { generateStepConfig } from '../../../codegen/generators/config.js'

describe('generateStepConfig', () => {
  it('returns null for undefined config', () => {
    expect(generateStepConfig(undefined)).toBeNull()
  })

  it('returns null for empty config', () => {
    expect(generateStepConfig({})).toBeNull()
  })

  it('generates retries with string delay', () => {
    const config: StepConfig = {
      retries: { limit: 3, delay: '5 seconds' },
    }
    expect(generateStepConfig(config)).toBe('{ retries: { limit: 3, delay: "5 seconds" } }')
  })

  it('generates retries with numeric delay', () => {
    const config: StepConfig = {
      retries: { limit: 2, delay: 5000 },
    }
    expect(generateStepConfig(config)).toBe('{ retries: { limit: 2, delay: 5000 } }')
  })

  it('generates retries with backoff', () => {
    const config: StepConfig = {
      retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
    }
    const result = generateStepConfig(config)
    expect(result).toContain('backoff: "exponential"')
  })

  it('generates all backoff types', () => {
    for (const backoff of ['constant', 'linear', 'exponential'] as const) {
      const config: StepConfig = {
        retries: { limit: 1, delay: 1000, backoff },
      }
      expect(generateStepConfig(config)).toContain(`backoff: "${backoff}"`)
    }
  })

  it('generates timeout with string value', () => {
    const config: StepConfig = { timeout: '30 seconds' }
    expect(generateStepConfig(config)).toBe('{ timeout: "30 seconds" }')
  })

  it('generates timeout with numeric value', () => {
    const config: StepConfig = { timeout: 30000 }
    expect(generateStepConfig(config)).toBe('{ timeout: 30000 }')
  })

  it('generates both retries and timeout', () => {
    const config: StepConfig = {
      retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
      timeout: '1 minute',
    }
    const result = generateStepConfig(config)!
    expect(result).toContain('retries:')
    expect(result).toContain('timeout: "1 minute"')
    expect(result.startsWith('{ ')).toBe(true)
    expect(result.endsWith(' }')).toBe(true)
  })
})
