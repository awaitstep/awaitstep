import { describe, it, expect } from 'vitest'
import { workerName, workflowClassName } from '../naming.js'

describe('workerName', () => {
  it('prefixes with awaitstep', () => {
    expect(workerName('my-workflow')).toBe('awaitstep-my-workflow')
  })

  it('lowercases and sanitizes', () => {
    expect(workerName('My Workflow!')).toBe('awaitstep-my-workflow')
  })

  it('collapses multiple hyphens', () => {
    expect(workerName('a--b--c')).toBe('awaitstep-a-b-c')
  })

  it('strips leading/trailing hyphens from the id part', () => {
    expect(workerName('-test-')).toBe('awaitstep-test')
  })

  it('throws on empty string', () => {
    expect(() => workerName('')).toThrow('at least one alphanumeric')
  })

  it('throws on all-special-characters string', () => {
    expect(() => workerName('!!!')).toThrow('at least one alphanumeric')
  })
})

describe('workflowClassName', () => {
  it('converts to PascalCase', () => {
    expect(workflowClassName('my-workflow')).toBe('MyWorkflow')
  })

  it('handles underscores', () => {
    expect(workflowClassName('send_email')).toBe('SendEmail')
  })

  it('handles spaces and special chars', () => {
    expect(workflowClassName('my cool workflow!')).toBe('MyCoolWorkflow')
  })

  it('throws on empty string', () => {
    expect(() => workflowClassName('')).toThrow('at least one alphanumeric')
  })

  it('throws on all-special-characters string', () => {
    expect(() => workflowClassName('---')).toThrow('at least one alphanumeric')
  })

  it('prefixes with Workflow when name starts with digit', () => {
    expect(workflowClassName('1-step')).toBe('Workflow1Step')
  })
})
