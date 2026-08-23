import { describe, it, expect } from 'vitest'
import { parseExpressions, resolveExpressions } from '../expressions'

/**
 * The v1 implementation, embedded verbatim as the compatibility oracle: for
 * every string the v1 regex handled, the v2 parser must parse and resolve
 * byte-identically. (Numeric dot-segments are the one intentional divergence
 * — v1 emitted invalid JS like `.0.` which could never deploy — and are
 * covered in expressions-v2.test.ts instead.)
 */
const V1_PATTERN = /\{\{(\w+(?:\.\w+)*)\}\}/g

function v1Parse(input: string) {
  const results: { raw: string; nodeId: string; path: string[] }[] = []
  let match: RegExpExecArray | null
  const pattern = new RegExp(V1_PATTERN.source, 'g')
  while ((match = pattern.exec(input)) !== null) {
    const parts = match[1]!.split('.')
    results.push({ raw: match[0], nodeId: parts[0]!, path: parts.slice(1) })
  }
  return results
}

function v1Resolve(input: string, nameResolver: (id: string) => string = (id) => id) {
  return input.replace(V1_PATTERN, (_m, expr: string) => {
    const parts = expr.split('.')
    const accessor = parts.length > 1 ? `.${parts.slice(1).join('.')}` : ''
    return `${nameResolver(parts[0]!)}${accessor}`
  })
}

/**
 * Corpus drawn from registry templates, codegen fixtures, workflow templates,
 * and the historical test suite — every `{{…}}` form found in the repo, plus
 * literal-brace strings that must stay untouched.
 */
const CORPUS = [
  '{{attempt_charge}}',
  '{{auth.token}}',
  '{{capture_cart.cartId}} + {{capture_cart.email}}',
  'Bearer {{env.RESEND_API_KEY}}',
  'https://api.com/{{fetch_data.userId}}/details',
  '{"message": "Hello {{greet.message}}"}',
  '{{event.payload.recipients}}',
  '{{parse_webhook.payload}} sig={{parse_webhook.signature}}',
  '{{prepare_batch.euBatch}} vs {{prepare_batch.usBatch}}',
  'return { us: {{process_region_us}}, eu: {{process_region_eu}} };',
  '{{step1.data.name}}',
  '{{my_step.output}}',
  '{{trigger.userId}}',
  // Left literal by v1 — must stay literal in v2 too:
  '{{my-step.output}}',
  '{{step-1.result}}',
  '{{ space }}',
  '{{ }}',
  '{{}}',
  '{{.path}}',
  'if (x) { return { a: 1 } } // braces galore }}{{',
  'css: .cls {{ color: red; }}',
  'const tpl = `${x} {{ hi }}`',
]

const RESOLVERS: Array<(id: string) => string> = [
  (id) => id,
  (id) => `state['${id}']`,
  (id) => `V_${id}`,
]

describe('v1 compatibility corpus', () => {
  for (const sample of CORPUS) {
    it(`parses identically: ${JSON.stringify(sample.slice(0, 48))}`, () => {
      expect(parseExpressions(sample)).toEqual(v1Parse(sample))
    })

    it(`resolves identically: ${JSON.stringify(sample.slice(0, 48))}`, () => {
      for (const resolver of RESOLVERS) {
        expect(resolveExpressions(sample, resolver)).toBe(v1Resolve(sample, resolver))
      }
    })
  }
})
