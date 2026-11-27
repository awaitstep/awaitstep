import { describe, expect, it } from 'vitest'
import { wrapModuleCalls } from '@awaitstep/codegen'

describe('wrapModuleCalls', () => {
  it('wraps a module call that would outgrow the line once indented, keeping the call whole', () => {
    const long =
      'const SomeLongResultName = await flow.step("a-long-step-id", (ctx) => $SomeLongResultName(stepArgs({ env, event, inputs: { producer }, ctx })));'
    expect(wrapModuleCalls(long, 2)).toBe(
      'const SomeLongResultName = await flow.step("a-long-step-id", (ctx) =>\n  $SomeLongResultName(stepArgs({ env, event, inputs: { producer }, ctx })),\n);',
    )
  })

  it('leaves a call that fits on one line, and counts the indentation it will get', () => {
    const line = 'await flow.step("t", (ctx) => $t(stepArgs({ env, event, inputs: {}, ctx })));'
    expect(wrapModuleCalls(line, 2)).toBe(line)
    // The same line, indented deeper than the width allows, wraps.
    expect(wrapModuleCalls(line, 40)).toBe(
      'await flow.step("t", (ctx) =>\n  $t(stepArgs({ env, event, inputs: {}, ctx })),\n);',
    )
  })

  it('wraps the lean form as a block', () => {
    const lean =
      '  await flow.step("report", async (ctx) => { await $Report(stepArgs({ env, event, inputs: { Fetch_data }, ctx })); });'
    expect(wrapModuleCalls(lean, 4)).toBe(
      '  await flow.step("report", async (ctx) => {\n    await $Report(stepArgs({ env, event, inputs: { Fetch_data }, ctx }));\n  });',
    )
  })
})
