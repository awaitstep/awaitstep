import { describe, expect, it } from 'vitest'
import { curlFor, jsonProblem, notCallableReason, prettyBody } from '../function-call'

describe('function call helpers', () => {
  it('stops a body that isn’t JSON before it is sent', () => {
    expect(jsonProblem('{"a":1}')).toBeNull()
    expect(jsonProblem('')).toBeNull()
    expect(jsonProblem('{a:1}')).not.toBeNull()
  })

  it('indents a JSON answer, and leaves anything else as it came', () => {
    expect(prettyBody('{"a":1}', 'application/json; charset=utf-8')).toBe('{\n  "a": 1\n}')
    expect(prettyBody('{"a":1', 'application/json')).toBe('{"a":1')
    expect(prettyBody('<p>hi</p>', 'text/html')).toBe('<p>hi</p>')
  })

  it('quotes the body for a shell, single quotes included', () => {
    expect(curlFor('https://fn.acme.workers.dev', `{"name":"O'Brien"}`)).toBe(
      `curl -X POST 'https://fn.acme.workers.dev' -H 'content-type: application/json' -d '{"name":"O'\\''Brien"}'`,
    )
  })

  it('says why a deployment can’t be called, from the provider’s pattern', () => {
    const pattern = '^https://[a-z0-9-]+(\\.[a-z0-9-]+)*\\.workers\\.dev(?:[/?#]|$)'
    expect(notCallableReason('https://fn.acme.workers.dev', pattern)).toBeNull()
    expect(notCallableReason('https://api.acme.com', pattern)).toMatch(/can’t be called from here/)
    expect(notCallableReason(null, pattern)).toBe('This deployment has no URL to call.')
    // No pattern known: the server decides.
    expect(notCallableReason('https://api.acme.com')).toBeNull()
  })
})
