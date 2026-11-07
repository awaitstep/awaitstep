import { JS_RESERVED_WORDS } from '@awaitstep/ir'

export function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
}

const EXPORT_PREFIX_RE = /^EXPORT_(.+)$/

/**
 * In script mode, a node whose display name starts with `EXPORT_` is exposed
 * on the `graph` object the user's fetch handler receives. The prefix is a
 * pure marker — it's stripped from the resulting var/key name.
 */
export function isExportedName(name: string): boolean {
  return EXPORT_PREFIX_RE.test(name)
}

/**
 * Strip the `EXPORT_` marker from a node name so the var/key is the clean
 * identifier the user wrote (e.g. `EXPORT_DirectMail` → `DirectMail`).
 * Returns the original name if no marker is present.
 */
export function stripExportPrefix(name: string): string {
  const m = EXPORT_PREFIX_RE.exec(name)
  return m ? m[1]! : name
}

/**
 * Node kinds whose whole purpose is a value (an HTTP response, a sub-worker's
 * output, a sub-workflow handle): a function returns them without a switch.
 */
export const AUTO_EXPORT_TYPES: ReadonlySet<string> = new Set([
  'http_request',
  'sub_workflow',
  'sub_script',
])

/** What a response key may look like: a plain identifier, so `graph.<key>` reads. */
export const EXPORT_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** An identifier that becomes a property: `__proto__` in an object literal sets the prototype instead. */
export function isValidExportKey(key: string): boolean {
  return EXPORT_KEY_RE.test(key) && key !== '__proto__'
}

/**
 * A node returns its value from a function when it is a step whose data says
 * so (`export: true`, the canvas's "Return this value" switch) or, the legacy
 * way for any kind, when its name carries the `EXPORT_` marker. Only a step
 * reads the flag: a registry node may have an `export` field of its own.
 */
export function isExportedNode(node: {
  type: string
  name: string
  data?: Record<string, unknown>
}): boolean {
  return (node.type === 'step' && node.data?.export === true) || isExportedName(node.name)
}

/**
 * The key an exported node's value is returned under: its `exportAs` when
 * that is an identifier, else its variable name.
 */
export function exportKeyFor(node: { data?: Record<string, unknown> }, varName: string): string {
  const key = node.data?.exportAs
  return typeof key === 'string' && isValidExportKey(key) ? key : varName
}

/**
 * Build a map from node ID to a unique, human-readable variable name
 * derived from the node's name (not its ID).
 */
/** ECMAScript reserved words: `const class = …` is a syntax error. */
// The language's own keywords come from the IR package, which validates names against them too.

/**
 * Names the generated body binds itself — the run's aliases, the step
 * primitives and the language's own keywords — so a node called "step",
 * "env" or "class" never shadows or breaks them.
 */
/**
 * Globals a step's code is likely to call. A step module's function is named
 * after the step, so a step called `fetch` would shadow `fetch` inside its own
 * body and call itself; `sanitizeIdentifier` keeps case, so the list does too.
 */
const RUNTIME_GLOBALS = [
  // ECMAScript
  'Object',
  'Function',
  'Array',
  'Number',
  'Boolean',
  'String',
  'Symbol',
  'BigInt',
  'Promise',
  'RegExp',
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'JSON',
  'Math',
  'Intl',
  'Reflect',
  'Proxy',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'FinalizationRegistry',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Atomics',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'Iterator',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'Infinity',
  'NaN',
  'undefined',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
  'escape',
  'unescape',
  'eval',
  'arguments',
  // Web and Workers
  'fetch',
  'console',
  'Request',
  'Response',
  'Headers',
  'URL',
  'URLSearchParams',
  'URLPattern',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',
  'atob',
  'btoa',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
  'structuredClone',
  'reportError',
  'performance',
  'navigator',
  'caches',
  'scheduler',
  'self',
  'origin',
  'Blob',
  'File',
  'FormData',
  'AbortController',
  'AbortSignal',
  'Event',
  'EventTarget',
  'CustomEvent',
  'DOMException',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'CompressionStream',
  'DecompressionStream',
  'WebSocket',
  'WebSocketPair',
  'MessageChannel',
  'MessagePort',
  'Cache',
  'CacheStorage',
  'Crypto',
  'SubtleCrypto',
  'CryptoKey',
  'HTMLRewriter',
  'EventSource',
  'Worker',
  'process',
  'Buffer',
  'require',
  'module',
  'exports',
  'window',
  'document',
  'location',
  // Names the generated code binds around a step
  '_output',
  '_loop_i',
  'err',
  'graph',
]

export const RESERVED_VAR_NAMES: ReadonlySet<string> = new Set([
  ...JS_RESERVED_WORDS,
  ...RUNTIME_GLOBALS,
  'env',
  'event',
  'flow',
  'step',
  'ctx',
  'inputs',
  'runGraph',
  'workflow',
  'globalThis',
  'crypto',
  'Date',
  'createWorkflowContext',
  'createInlineHost',
  'createCloudflareHost',
  'durableStep',
  'defineWorkflow',
  'defineFunction',
  'AWAITSTEP_RETENTION',
])

export function buildVarNameMap(nodes: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  const used = new Set<string>()
  // Where each base's suffix search resumes: a document with thousands of
  // identically-named steps would otherwise rescan `_2…_n` for every one.
  const nextSuffix = new Map<string, number>()

  for (const node of nodes) {
    // Drop the `EXPORT_` marker (if any) before sanitizing — the prefix is a
    // marker, not part of the identifier.
    let base = sanitizeIdentifier(stripExportPrefix(node.name))
    if (!base) base = sanitizeIdentifier(node.id)
    if (RESERVED_VAR_NAMES.has(base)) base = `${base}_node`

    // Unique against every name handed out so far — not a per-base count,
    // which let `q`, `q`, `q_2` collide on `q_2`.
    let varName = base
    if (used.has(varName)) {
      let n = nextSuffix.get(base) ?? 2
      while (used.has(`${base}_${n}`)) n++
      varName = `${base}_${n}`
      nextSuffix.set(base, n + 1)
    }
    used.add(varName)
    map.set(node.id, varName)
  }

  return map
}

export function deduplicateStepNames(names: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const name of names) {
    const count = counts.get(name) ?? 0
    counts.set(name, count + 1)
    if (count === 0) {
      result.set(name, name)
    } else {
      result.set(`${name}_${count}`, `${name} (${count})`)
    }
  }

  return result
}
