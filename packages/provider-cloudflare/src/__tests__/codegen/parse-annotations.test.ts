import { describe, it, expect } from 'vitest'
import {
  parseAnnotations,
  AnnotationParseError,
  type StrictParseResult,
} from '../../codegen/parse-annotations.js'

function expectStrict(source: string): StrictParseResult {
  const result = parseAnnotations(source)
  if (result.mode !== 'strict') throw new Error(`Expected strict mode, got ${result.mode}`)
  return result
}

describe('parseAnnotations — legacy mode', () => {
  it('returns legacy mode when no annotations present', () => {
    const source = `try { return new Response("ok") } catch (e) { return Response.json({}) }`
    const result = parseAnnotations(source)
    expect(result.mode).toBe('legacy')
    if (result.mode === 'legacy') {
      expect(result.fetchBody).toBe(source)
    }
  })

  it('treats @ inside string literal as legacy code (no annotations)', () => {
    const source = `const email = "user@example.com"; return Response.json({ email })`
    const result = parseAnnotations(source)
    expect(result.mode).toBe('legacy')
  })

  it('treats annotation-shaped text in JSDoc as legacy code', () => {
    const source = `
/**
 * Example:
 * @queue function emails() { ... }
 */
return Response.json({})
`
    const result = parseAnnotations(source)
    expect(result.mode).toBe('legacy')
  })

  it('treats annotation-shaped text in template literal as legacy code', () => {
    const source = 'const docs = `\n  @queue function emails(){}\n`\nreturn Response.json({ docs })'
    const result = parseAnnotations(source)
    expect(result.mode).toBe('legacy')
  })

  it('treats annotation-shaped text in line comment as legacy code', () => {
    const source = `// @queue function emails() {}
return Response.json({})`
    const result = parseAnnotations(source)
    expect(result.mode).toBe('legacy')
  })
})

describe('parseAnnotations — strict mode @fetch', () => {
  it('extracts a single @fetch handler', () => {
    const source = `@fetch function handler(request, env, ctx) {
  return new Response("ok")
}`
    const result = expectStrict(source)
    expect(result.fetchHandler).toBeDefined()
    expect(result.fetchHandler?.name).toBe('handler')
    expect(result.fetchHandler?.params).toBe('request, env, ctx')
    expect(result.fetchHandler?.body.trim()).toBe('return new Response("ok")')
    expect(result.queueHandlers).toHaveLength(0)
  })

  it('rejects @fetch with non-handler name', () => {
    const source = `@fetch function notHandler() { return new Response() }`
    expect(() => parseAnnotations(source)).toThrow(AnnotationParseError)
    expect(() => parseAnnotations(source)).toThrow(/requires function named 'handler'/)
  })

  it('rejects multiple @fetch handlers', () => {
    const source = `
@fetch function handler() { return new Response("a") }
@fetch function handler() { return new Response("b") }
`
    expect(() => parseAnnotations(source)).toThrow(/Multiple @fetch handlers/)
  })
})

describe('parseAnnotations — strict mode @queue', () => {
  it('extracts a single @queue handler', () => {
    const source = `@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}`
    const result = expectStrict(source)
    expect(result.fetchHandler).toBeUndefined()
    expect(result.queueHandlers).toHaveLength(1)
    expect(result.queueHandlers[0]!.name).toBe('emails')
    expect(result.queueHandlers[0]!.params).toBe('batch, env, ctx')
    expect(result.queueHandlers[0]!.body).toContain('msg.ack()')
  })

  it('extracts multiple @queue handlers with different names', () => {
    const source = `
@queue function emails(batch, env, ctx) { /* a */ }
@queue function jobs(batch, env, ctx) { /* b */ }
@queue function analytics(batch, env, ctx) { /* c */ }
`
    const result = expectStrict(source)
    expect(result.queueHandlers.map((h) => h.name)).toEqual(['emails', 'jobs', 'analytics'])
  })

  it('rejects duplicate @queue names', () => {
    const source = `
@queue function emails(b, e, c) {}
@queue function emails(b, e, c) {}
`
    expect(() => parseAnnotations(source)).toThrow(/Duplicate queue handler 'emails'/)
  })
})

describe('parseAnnotations — combined handlers', () => {
  it('extracts both @fetch and @queue', () => {
    const source = `
import puppeteer from "@cloudflare/puppeteer"

@fetch function handler(request, env, ctx) {
  return Response.json({})
}

@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const result = expectStrict(source)
    expect(result.fetchHandler?.body).toContain('Response.json')
    expect(result.queueHandlers).toHaveLength(1)
    expect(result.queueHandlers[0]!.name).toBe('emails')
    expect(result.moduleCode).toContain('import puppeteer')
  })

  it('strips annotated functions from moduleCode but keeps top-level code', () => {
    const source = `import puppeteer from "@cloudflare/puppeteer"
const SHARED = 42

@fetch function handler(request, env, ctx) {
  return Response.json({ SHARED })
}

function helper() { return 'help' }`
    const result = expectStrict(source)
    expect(result.moduleCode).toContain('import puppeteer')
    expect(result.moduleCode).toContain('const SHARED = 42')
    expect(result.moduleCode).toContain('function helper()')
    expect(result.moduleCode).not.toContain('@fetch')
    expect(result.moduleCode).not.toContain('return Response.json({ SHARED })')
  })

  it('preserves line numbers when stripping', () => {
    const source = `// line 1
@fetch function handler() {
  return new Response()
}
// line 5
return moduleCode`
    const result = expectStrict(source)
    // The stripped function spans lines 2-4. Module code should keep the same
    // total line count (newlines preserved).
    expect(result.moduleCode.split('\n')).toHaveLength(source.split('\n').length)
  })
})

describe('parseAnnotations — handler bodies with nested constructs', () => {
  it('handles function bodies with nested braces', () => {
    const source = `@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) {
    if (msg.body) {
      try {
        msg.ack()
      } catch (e) {
        console.error(e)
      }
    }
  }
}`
    const result = expectStrict(source)
    expect(result.queueHandlers[0]!.body).toContain('try {')
    expect(result.queueHandlers[0]!.body).toContain('console.error(e)')
  })

  it('handles bodies with strings containing braces', () => {
    const source = `@queue function emails(b, e, c) {
  const msg = "} not a closing brace"
  return msg
}`
    const result = expectStrict(source)
    expect(result.queueHandlers[0]!.body).toContain('"} not a closing brace"')
  })

  it('handles bodies with template literals containing braces', () => {
    const source = `@queue function emails(b, e, c) {
  const msg = \`hello \${name}\`
  return msg
}`
    const result = expectStrict(source)
    expect(result.queueHandlers[0]!.body).toContain('${name}')
  })

  it('handles bodies with line comments containing braces', () => {
    const source = `@queue function emails(b, e, c) {
  // braces in comment }
  return null
}`
    const result = expectStrict(source)
    expect(result.queueHandlers[0]!.body).toContain('// braces in comment }')
    expect(result.queueHandlers[0]!.body).toContain('return null')
  })

  it('handles bodies with block comments containing braces', () => {
    const source = `@queue function emails(b, e, c) {
  /* nested } } } braces */
  return null
}`
    const result = expectStrict(source)
    expect(result.queueHandlers[0]!.body).toContain('/* nested } } } braces */')
  })
})

describe('parseAnnotations — placement validation', () => {
  it('rejects @queue annotation inside a function body', () => {
    const source = `@fetch function handler(request, env, ctx) {
  @queue function emails(b, e, c) {}
  return Response.json({})
}`
    expect(() => parseAnnotations(source)).toThrow(/must be declared at top level/)
  })

  it('rejects @queue annotation inside a try/catch block', () => {
    const source = `try {
  @queue function emails(b, e, c) {}
} catch (e) {}`
    expect(() => parseAnnotations(source)).toThrow(/must be declared at top level/)
  })
})

describe('parseAnnotations — entry-point validation', () => {
  it('rejects strict mode with no handlers (annotation but unsupported kind)', () => {
    // Only one annotation, and it's invalid kind — gets rejected before "no entry point".
    const source = `@scheduled function cron(event, env, ctx) {}`
    expect(() => parseAnnotations(source)).toThrow(/Unknown annotation '@scheduled'/)
  })

  it('queue-only worker is valid (no @fetch required)', () => {
    const source = `@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}`
    const result = expectStrict(source)
    expect(result.fetchHandler).toBeUndefined()
    expect(result.queueHandlers).toHaveLength(1)
  })
})

describe('parseAnnotations — error messages include line numbers', () => {
  it('reports the line of the offending @fetch with wrong name', () => {
    const source = `// line 1
// line 2
@fetch function notHandler() {}`
    try {
      parseAnnotations(source)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AnnotationParseError)
      expect((err as AnnotationParseError).line).toBe(3)
    }
  })

  it('reports the line of the duplicate @queue', () => {
    const source = `@queue function emails(b, e, c) {}

@queue function emails(b, e, c) {}`
    try {
      parseAnnotations(source)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AnnotationParseError)
      expect((err as AnnotationParseError).line).toBe(3)
    }
  })
})

describe('parseAnnotations — unsupported annotations', () => {
  it('rejects unknown annotation kinds', () => {
    const source = `@scheduled function cron(event, env, ctx) {}`
    expect(() => parseAnnotations(source)).toThrow(/Unknown annotation '@scheduled'/)
  })
})
