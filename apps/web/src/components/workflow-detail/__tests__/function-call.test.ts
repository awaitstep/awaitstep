import { describe, expect, it } from 'vitest'
import { jsonProblem, prettyBody } from '../function-call'

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
})
