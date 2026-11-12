import { describe, expect, it } from 'vitest'
import { nodeDefinitionSchema } from '@awaitstep/ir'
import { validateNode, type NodeInput } from '../lib/validate-node.js'
import { validInput } from './fixtures/node.js'

function clone(): NodeInput {
  return structuredClone(validInput)
}

function errors(input: NodeInput) {
  return validateNode(input, nodeDefinitionSchema).filter((issue) => issue.level === 'error')
}

describe('validateNode', () => {
  it('accepts a valid node', () => {
    expect(errors(validInput)).toEqual([])
  })

  it('requires base.json', () => {
    const input = clone()
    delete input.base
    expect(errors(input).some((issue) => issue.message === 'missing base.json')).toBe(true)
  })

  it('rejects version/description in base.json', () => {
    const input = clone()
    input.base = { ...input.base!, version: '1.0.0', description: 'x' }
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('base.json must not contain version')
    expect(messages).toContain('base.json must not contain description')
  })

  it('requires overrides.json', () => {
    const input = clone()
    delete input.versions[0].overrides
    expect(errors(input)[0]?.message).toBe('missing overrides.json')
  })

  it('rejects unsupported override keys and id changes', () => {
    const input = clone()
    input.versions[0].overrides = {
      ...input.versions[0].overrides,
      id: 'other',
      mystery: true,
    }
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('unsupported override key "id"')
    expect(messages).toContain('unsupported override key "mystery"')
  })

  it('requires overrides version and description to match', () => {
    const input = clone()
    input.versions[0].overrides = { version: '9.9.9' }
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('version "9.9.9" does not match directory')
    expect(messages).toContain('description is required')
  })

  it('rejects action cases that are not options and options without cases', () => {
    const input = clone()
    input.versions[0].templates.cloudflare = `export default async function (ctx) {
      switch (ctx.config.action) {
        case 'Other': return { id: '1' }
      }
    }`
    const messages = errors(input).map((issue) => issue.message)
    expect(
      messages.some((message) => message.includes('case "Other" is not an action option')),
    ).toBe(true)
    expect(
      messages.some((message) => message.includes('option "Do Thing" has no template case')),
    ).toBe(true)
  })

  it('rejects config and env references that are not declared', () => {
    const input = clone()
    input.versions[0].templates.cloudflare = `export default async function (ctx) {
      case_placeholder(ctx.config.missing, ctx.env.MISSING)
      return { id: '1' }
    }`
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('template reads ctx.config.missing, which is not in configSchema')
    expect(messages).toContain('template reads ctx.env.MISSING, which has no secret envVarName')
  })

  it('rejects whole-object ctx access', () => {
    const input = clone()
    input.versions[0].templates.cloudflare = `export default async function (ctx) {
      console.log(ctx.config)
      return { id: '1' }
    }`
    expect(errors(input).some((issue) => issue.message.includes('ctx.config as a whole'))).toBe(
      true,
    )
  })

  it('rejects imports that are not declared as dependencies', () => {
    const input = clone()
    input.versions[0].templates.cloudflare = `import { thing } from 'mystery-package'
      export default async function (ctx) {
        return { id: String(ctx.config.action) + thing }
      }`
    expect(
      errors(input).some((issue) =>
        issue.message.includes('imports mystery-package, which is not in dependencies'),
      ),
    ).toBe(true)
  })

  it('rejects Node-only and durable APIs', () => {
    const input = clone()
    input.versions[0].templates.cloudflare = `export default async function (ctx) {
      const path = process.cwd()
      const buffer = Buffer.from('x')
      await step.sleep('wait', '1 second')
      return { id: path + buffer.length }
    }`
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('Node process API is not available in a node template')
    expect(messages).toContain('Node Buffer is not available in a node template')
    expect(messages).toContain('templates must not call durable primitives')
  })

  it('requires docsUrl and a valid URL', () => {
    const input = clone()
    input.base = { ...input.base!, docsUrl: 'not a url' }
    expect(
      errors(input).some((issue) => issue.message.includes('docsUrl is not a valid URL')),
    ).toBe(true)
    const missing = clone()
    missing.base = { ...missing.base! }
    delete (missing.base as Record<string, unknown>).docsUrl
    expect(errors(missing).some((issue) => issue.message === 'docsUrl is required')).toBe(true)
  })

  it('rejects descriptions over 120 characters', () => {
    const input = clone()
    input.versions[0].overrides = { ...input.versions[0].overrides, description: 'x'.repeat(121) }
    expect(errors(input).some((issue) => issue.message.includes('max 120'))).toBe(true)
  })

  it('checks version directories and semver', () => {
    const input = clone()
    input.versions = [
      { ...input.versions[0], version: '1.0.0', overrides: { version: '1.0.0', description: 'x' } },
      { ...input.versions[0], version: '1.0.0', overrides: { version: '1.0.0', description: 'y' } },
    ]
    expect(errors(input).some((issue) => issue.message === 'duplicate version')).toBe(true)
    const bad = clone()
    bad.versions[0].version = 'one'
    bad.versions[0].overrides = { version: 'one', description: 'x' }
    expect(errors(bad).some((issue) => issue.message.startsWith('not a semver version'))).toBe(true)
  })

  it('requires a template for every provider and an icon', () => {
    const input = clone()
    input.versions[0].templates = {}
    input.iconExists = false
    const messages = errors(input).map((issue) => issue.message)
    expect(messages).toContain('missing template for provider "cloudflare"')
    expect(messages).toContain('no templates found')
    expect(messages).toContain('missing icon.svg')
  })

  it('checks output schema property and item shapes when present', () => {
    const input = clone()
    input.base = {
      ...input.base!,
      outputSchema: {
        badObject: { type: 'object', properties: 'nope' },
        badArray: { type: 'array', items: 'nope' },
      },
    }
    const messages = errors(input).map((issue) => issue.message)
    expect(messages.some((message) => message.includes('properties'))).toBe(true)
    expect(messages.some((message) => message.includes('items'))).toBe(true)
  })
})
