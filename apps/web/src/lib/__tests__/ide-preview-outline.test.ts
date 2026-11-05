import { describe, expect, it } from 'vitest'
import { parse, walk, type CssNode } from 'css-tree'
import { outlineCss } from '../ide/preview-outline'

describe('outlineCss', () => {
  it('draws the open step firmly and importers lightly, keyed on the node wrapper', () => {
    const css = outlineCss('scope', ['a'], ['b'])
    expect(css).toContain('.scope .react-flow__node[data-id="a"] { outline: 2px solid')
    expect(css).toContain('.scope .react-flow__node[data-id="b"] { outline: 1px solid')
  })

  it('draws a step that is both once, firmly', () => {
    const css = outlineCss('scope', ['a'], ['a'])
    expect(css.match(/data-id="a"/g)).toHaveLength(1)
    expect(css).toContain('2px solid')
  })

  it('is empty when nothing is outlined', () => {
    expect(outlineCss('scope', [], [])).toBe('')
  })

  describe('hostile ids', () => {
    const HOSTILE: [string, string][] = [
      ['CR', 'x\r] {} * { display:none !important } .z[q='],
      ['form feed', 'x\f] {} * { display:none } .z[q='],
      ['CRLF', 'x\r\n] {} * { display:none } .z[q='],
      ['LF', 'x\n] {} * { display:none } .z[q='],
      ['NUL', 'x\u0000y'],
      ['style close', '</style><script>alert(1)</script>'],
      ['lone surrogate', 'x\ud800y'],
      ['quotes and brackets', `a"'] { x: y } [z="`],
      ['backslash end', 'trailing\\'],
      ['font load', '] {} @font-face { src: url(https://evil.example/f) } .a['],
      ['leading digit', '1abc'],
    ]

    function inspect(css: string) {
      const errors: string[] = []
      const ast = parse(css, { onParseError: (e) => errors.push(e.message) })
      const rules: CssNode[] = []
      let other = 0
      walk(ast, (node) => {
        if (node.type === 'Rule') rules.push(node)
        else if (node.type === 'Atrule') other++
      })
      return { errors, rules, other }
    }

    it.each(HOSTILE)('keeps %s inside one rule per id', (_name, id) => {
      const css = outlineCss('scope', [id], [`${id}-used`])
      const { errors, rules, other } = inspect(css)
      expect(errors).toEqual([])
      expect(other).toBe(0)
      expect(rules).toHaveLength(2)
      for (const rule of rules) {
        if (rule.type !== 'Rule') continue
        const attributes: string[] = []
        walk(rule.prelude, (n) => {
          if (n.type === 'AttributeSelector') attributes.push(n.name.name)
        })
        expect(attributes).toEqual(['data-id'])
      }
    })

    it.each(HOSTILE)('leaves no raw control character or metacharacter for %s', (_name, id) => {
      const css = outlineCss('scope', [id], [])
      // eslint-disable-next-line no-control-regex
      expect(css).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f\ud800-\udfff<>]/)
      const selector = css.slice(0, css.indexOf(' { '))
      expect(selector.match(/"/g)).toHaveLength(2)
    })
  })
})
