import { describe, expect, it } from 'vitest'
import { pruneUndeclaredInputs, wrapModuleCalls } from '../../codegen/generate-helpers.js'

describe('pruneUndeclaredInputs', () => {
  it('keeps inputs bound by a const or a hoisted let and drops the rest', () => {
    const body = [
      'let Hoisted;',
      'const a = await flow.step("a", (ctx) => $a({ env, event, inputs: {}, step, ctx }));',
      'await flow.step("b", (ctx) => $b({ env, event, inputs: { a, ghost, Hoisted }, step, ctx }));',
      'await flow.step("c", (ctx) => $c({ env, event, inputs: { ghost }, step, ctx }));',
    ].join('\n')
    const pruned = pruneUndeclaredInputs(body)
    expect(pruned).toContain('$b({ env, event, inputs: { a, Hoisted }, step, ctx })')
    expect(pruned).toContain('$c({ env, event, inputs: {}, step, ctx })')
  })

  it('counts the names the caller binds itself, such as a let it adds afterwards', () => {
    const body = 'await flow.step("b", (ctx) => $b({ env, event, inputs: { later }, step, ctx }));'
    expect(pruneUndeclaredInputs(body, ['later'])).toContain('inputs: { later }')
  })

  it('touches only the generated call, never an inputs object in a person’s code', () => {
    const body = [
      'await fetch(url, { body: JSON.stringify({ inputs: { userId } }) });',
      'const payload = { inputs: { key: value } };',
      'await flow.step("b", (ctx) => $b({ env, event, inputs: { userId }, step, ctx }));',
    ].join('\n')
    const pruned = pruneUndeclaredInputs(body)
    expect(pruned).toContain('JSON.stringify({ inputs: { userId } })')
    expect(pruned).toContain('const payload = { inputs: { key: value } };')
    expect(pruned).toContain('$b({ env, event, inputs: {}, step, ctx })')
  })

  it('does not take a declaration in a comment for a binding', () => {
    const body = [
      '// const ghost = 1',
      'await flow.step("b", (ctx) => $b({ env, event, inputs: { ghost }, step, ctx }));',
    ].join('\n')
    expect(pruneUndeclaredInputs(body)).toContain('inputs: {}')
  })

  it('leaves a body without step calls alone', () => {
    expect(pruneUndeclaredInputs('const x = 1;')).toBe('const x = 1;')
  })
})

describe('wrapModuleCalls', () => {
  it('wraps a module call that would outgrow the line once indented, keeping the call whole', () => {
    const long =
      'const SomeLongResultName = await flow.step("a-long-step-id", (ctx) => $SomeLongResultName({ env, event, inputs: { producer }, step, ctx }));'
    expect(wrapModuleCalls(long, 2)).toBe(
      'const SomeLongResultName = await flow.step("a-long-step-id", (ctx) =>\n  $SomeLongResultName({ env, event, inputs: { producer }, step, ctx }),\n);',
    )
  })

  it('leaves a call that fits on one line, and counts the indentation it will get', () => {
    const line = 'await flow.step("t", (ctx) => $t({ env, event, inputs: {}, step, ctx }));'
    expect(wrapModuleCalls(line, 2)).toBe(line)
    // The same line, indented deeper than the width allows, wraps.
    expect(wrapModuleCalls(line, 40)).toBe(
      'await flow.step("t", (ctx) =>\n  $t({ env, event, inputs: {}, step, ctx }),\n);',
    )
  })

  it('wraps the lean form as a block', () => {
    const lean =
      '  await flow.step("report", async (ctx) => { await $Report({ env, event, inputs: { Fetch_data }, step, ctx }); });'
    expect(wrapModuleCalls(lean, 4)).toBe(
      '  await flow.step("report", async (ctx) => {\n    await $Report({ env, event, inputs: { Fetch_data }, step, ctx });\n  });',
    )
  })
})
