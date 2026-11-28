/**
 * Names generated code binds where step code runs: a step module's
 * parameters, the graph module's locals around each step, and what a
 * container body references. A loop item with one of these names would hide
 * it inside the loop.
 */
export const GENERATED_BODY_NAMES: readonly string[] = [
  'env',
  'event',
  'inputs',
  'step',
  'ctx',
  'flow',
  'stepArgs',
  'waitForEventOrTimeout',
  '_loop_i',
  '_output',
  'err',
]

/**
 * Every name generated code binds in a graph module:
 * {@link GENERATED_BODY_NAMES} plus the module's own imports and top-level
 * bindings. A node's variable is moved off these (`<name>_node`).
 */
export const GENERATED_NAMES: readonly string[] = [
  ...GENERATED_BODY_NAMES,
  'runGraph',
  'workflow',
  'graph',
  'defineWorkflow',
  'defineFunction',
  'createWorkflowContext',
  'createInlineHost',
  'createCloudflareHost',
  'createAwaitstepPlatform',
  'AWAITSTEP_RETENTION',
]

/**
 * The names an inline step may not declare at its top level. Inline code is
 * pasted into `run` / `runGraph` itself, beside these locals and before the
 * generated lines that read them (or the imports they call), so a
 * declaration redeclares or replaces them for every step after it. Some are
 * bound only when the graph needs them (`stepArgs` once a step module is
 * called, `platform` once a function calls another artifact); they count
 * anyway, so adding a step later doesn't break the inline one.
 */
export const INLINE_TAKEN_NAMES: readonly string[] = [
  'env',
  'event',
  'flow',
  'step',
  'stepArgs',
  'waitForEventOrTimeout',
  'createWorkflowContext',
  'createInlineHost',
  'createAwaitstepPlatform',
  'platform',
]
