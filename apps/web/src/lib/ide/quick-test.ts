/**
 * Running one step's body on its own, in the browser, against inputs the
 * user makes up.
 *
 * A test session boots a real worker in a container: correct, and slow
 * enough that you stop reaching for it while editing a transform. This runs
 * the open step module in a Web Worker inside a null-origin sandbox instead —
 * no container, no deploy, no version, no access to this app's session or
 * API. It is a scratchpad for the body's logic, not a runtime: the `step`
 * object is a stub, nothing is durable, and imports are not resolved.
 */
import { isGlobalEnvRef } from '@awaitstep/ir'
import { moduleInputReads } from '@awaitstep/codegen'
import { splitSecretName } from '../env-var-parser'

// A step's own file, `steps/<id>.ts` (`stepSourcePath`), which the bundle runs as the step's module.
const STEP_MODULE_PATH = /^steps\/[^/]+\.(?:ts|js)$/

/** Whether a file is a step's module — the step's own file, run as it is. */
export function isStepModulePath(path: string): boolean {
  return STEP_MODULE_PATH.test(path)
}

export interface StepModuleShape {
  /** Names the module reads from `inputs`, in the order they appear. */
  inputNames: string[]
  hasDefaultExport: boolean
}

const DEFAULT_EXPORT = /^export\s+default\s+/m

/**
 * What a step module offers a quick test. Pattern-matched rather than
 * parsed: these files are generated to a shape this repo controls, and the
 * cost of being wrong is a clear refusal rather than a bad run.
 *
 * Exports and imports are deliberately not counted here — whether either
 * survives to the worker is a question about the transpiled output, not the
 * source. See {@link unrunnableReason}.
 */
export function parseStepModule(source: string): StepModuleShape {
  return {
    // The same reading codegen binds the call with: members, indexes, destructures.
    inputNames: [...moduleInputReads(source).names],
    hasDefaultExport: DEFAULT_EXPORT.test(source),
  }
}

/**
 * Why this module cannot be quick-tested, in the user's terms — or null.
 *
 * Only what is knowable from the source, which is whether there is anything
 * to run at all.
 */
export function quickTestRefusal(shape: StepModuleShape): string | null {
  if (!shape.hasDefaultExport) {
    return 'This file has no default export to run. Quick test runs a step module’s default function.'
  }
  return null
}

const STATIC_IMPORT = /^[ \t]*import\b(?:[^'"]*?from)?\s*['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\bimport\s*\(/
const NON_DEFAULT_EXPORT = /^export\s+(?!default\b)/m

/**
 * Why the transpiled script would not load in the worker — or null.
 *
 * Judged on the output rather than the source, because the transpiler
 * erases what is only a type: an `import` used for a type annotation, an
 * `export type`, an `export interface`. Reading the source refused files
 * that run perfectly well.
 *
 * Matched rather than parsed, so `import(` inside a string counts too. That
 * direction is deliberate: a needless refusal says why, while something
 * missed reaches the worker and fails as "Failed to fetch" or
 * "Unexpected token 'export'".
 */
export function unrunnableReason(js: string): string | null {
  const imports = unresolvableImports(js)
  if (imports.length > 0) {
    return `Quick test runs this step on its own and doesn’t resolve imports (${imports[0]}). Use a test session to run the whole workflow.`
  }
  if (NON_DEFAULT_EXPORT.test(js)) {
    // Only the default export is rewritten into a binding; anything else is
    // still an `export` statement, which a classic worker will not parse.
    return 'This file exports more than its default. Quick test runs a single step function. Use a test session to run the whole workflow.'
  }
  return null
}

/** Imports that would still be there when the worker loads the script. */
export function unresolvableImports(js: string): string[] {
  const statics = [...js.matchAll(STATIC_IMPORT)].map((match) => match[1]!)
  const dynamic = DYNAMIC_IMPORT.test(js) ? ['a dynamic import()'] : []
  return [...new Set([...statics, ...dynamic])]
}

/** The four things a generated step module is called with, minus `step`. */
export interface QuickTestArgs {
  env: unknown
  event: unknown
  inputs: unknown
}

export type QuickTestField = keyof QuickTestArgs

/**
 * The three editable fields as values, or which one is not valid JSON.
 *
 * Reported by field rather than as one error because all three are on
 * screen at once, and "Not valid JSON" over the wrong box is worse than no
 * message at all.
 */
export function parseQuickTestArgs(
  fields: Record<QuickTestField, string>,
): { ok: true; args: QuickTestArgs } | { ok: false; field: QuickTestField } {
  const parsed: Partial<QuickTestArgs> = {}
  for (const field of ['inputs', 'env', 'event'] as const) {
    const text = fields[field].trim()
    if (text === '') {
      parsed[field] = {}
      continue
    }
    try {
      parsed[field] = JSON.parse(text)
    } catch {
      return { ok: false, field }
    }
  }
  return { ok: true, args: parsed as QuickTestArgs }
}

/**
 * Seed values for `inputs`, one key per name the body destructures, so the
 * shape to fill in is on screen rather than something to remember.
 */
export function seedInputs(inputNames: readonly string[]): Record<string, null> {
  return Object.fromEntries(inputNames.map((name) => [name, null]))
}

/**
 * Seed values for `env`, from the workflow's variables.
 *
 * Two kinds are seeded blank rather than with what the store holds.
 * Secrets, because a quick test keeps its arguments in a textarea and most
 * steps poked at this way do not need the real key — typing one in is
 * deliberate. And references to a project variable (`{{global.env.X}}`),
 * because that is resolved when the workflow is prepared: passing the
 * literal through would hand the step a string of braces and fail a
 * `fetch(env.API_URL)` for reasons that have nothing to do with the step.
 */
export function seedEnv(vars: readonly { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(
    vars
      .map((v) => ({ ...splitSecretName(v.name), value: v.value }))
      // A half-typed row in the env editor is not a variable yet, and would
      // otherwise seed a nameless key.
      .filter((v) => v.name !== '')
      .map((v) => [v.name, v.isSecret || isGlobalEnvRef(v.value) ? '' : v.value]),
  )
}

/**
 * How the worker turns a value into text — everything crosses postMessage
 * that way, since a step may return a class instance or something cyclic,
 * which structured clone refuses, and the panel only ever displays it.
 *
 * Exported as source because it is the fiddliest thing in here and deserves
 * tests of its own: the first version used a visited-set and reported every
 * shared object as circular.
 */
export const SERIALIZER_SOURCE = `
function __awaitstep_fmt(value) {
  if (typeof value === 'string') return value;
  return __awaitstep_json(value);
}
function __awaitstep_json(value) {
  // Ancestors of the value being written, not everything already seen: the
  // same object used twice ({ a: cfg, b: cfg }) is shared, not circular, and
  // a plain visited-set would render the second one as "[Circular]".
  const ancestors = [];
  try {
    return JSON.stringify(value, function (key, val) {
      if (typeof val === 'bigint') return String(val) + 'n';
      if (typeof val === 'function') return '[Function ' + (val.name || 'anonymous') + ']';
      if (typeof val !== 'object' || val === null) return val;
      // \`this\` is the object holding \`val\`; unwind to it, then test.
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
      if (ancestors.indexOf(val) !== -1) return '[Circular]';
      // An Error is replaced by a plain object, and that replacement is what
      // gets walked next — so it, not the Error, has to be on the chain, or
      // the next unwind empties the stack and cycles stop being caught.
      var written = val instanceof Error ? { name: val.name, message: val.message } : val;
      ancestors.push(written);
      return written;
    }, 2);
  } catch (err) {
    try { return String(value); } catch { return '[unserializable]'; }
  }
}
`

/**
 * The worker's first message, before any user code: from then on it is
 * running, and an error the browser leaves undescribed is the step failing,
 * not the sandbox refusing to start a worker.
 */
export const WORKER_ALIVE = 'awaitstep:alive'

// Everything the prelude declares is prefixed, because it shares top-level
// scope with the user's module: a body with its own `const step` or
// `function toJSON` would otherwise fail to load with "already declared",
// and that arrives at the panel looking like the step threw.
const PRELUDE = `
"use strict";
self.postMessage({ type: '${WORKER_ALIVE}' });
${SERIALIZER_SOURCE}
function __awaitstep_post(message) { self.postMessage(message); }
function __awaitstep_log(level, args) {
  __awaitstep_post({ type: 'log', level: level, text: Array.prototype.map.call(args, __awaitstep_fmt).join(' ') });
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = function () { __awaitstep_log(level === 'debug' ? 'log' : level, arguments); };
}
const __awaitstep_stub = {
  do: async function (label, optionsOrFn, maybeFn) {
    const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
    __awaitstep_log('info', ['step.do(' + __awaitstep_json(label) + ')']);
    if (typeof fn !== 'function') return undefined;
    return await fn({ attempt: 1 });
  },
  sleep: async function (label) {
    __awaitstep_log('info', ['step.sleep(' + __awaitstep_json(label) + ') skipped in a quick test']);
  },
  sleepUntil: async function (label) {
    __awaitstep_log('info', ['step.sleepUntil(' + __awaitstep_json(label) + ') skipped in a quick test']);
  },
  waitForEvent: async function () {
    throw new Error('step.waitForEvent() needs a running workflow. Use a test session instead.');
  },
};
`

const RUNNER = `
self.onmessage = async function (e) {
  const data = e.data || {};
  try {
    const result = await __awaitstep_step({
      env: data.env,
      event: data.event,
      inputs: data.inputs,
      step: __awaitstep_stub,
      ctx: { attempt: 1 },
    });
    __awaitstep_post({ type: 'done', result: result === undefined ? '' : __awaitstep_json(result) });
  } catch (err) {
    __awaitstep_post({ type: 'failed', message: err && err.message ? String(err.message) : String(err) });
  }
};
`

/**
 * The module's default export, bound to a name the runner can call.
 *
 * Rewriting it away means no `export` survives, so this runs as a classic
 * worker rather than a module one — and `export default async function f()`
 * becomes a named function expression, which is still valid.
 */
export function bindDefaultExport(js: string): string {
  return js.replace(DEFAULT_EXPORT, 'const __awaitstep_step = ')
}

/** The full worker script for a transpiled step module. */
export function buildWorkerSource(moduleJs: string): string {
  return `${PRELUDE}\n${bindDefaultExport(moduleJs)}\n${RUNNER}`
}
