/**
 * Zod compiles object parsers with `new Function` and probes for that by
 * calling it once, when the first object schema is built. The dashboard's
 * Content-Security-Policy allows no `eval`: the probe is refused (and
 * reported as a violation) on every page. This script tells Zod to use its
 * interpreter instead, through the global object its config lives on.
 *
 * It runs as a head script (root route) because `z.config()` from a module
 * comes too late: the bundler evaluates the shared chunk holding
 * `@awaitstep/ir`'s schemas before any module of the entry chunk.
 */
export const ZOD_JITLESS_SCRIPT =
  'var g=globalThis;(g.__zod_globalConfig||(g.__zod_globalConfig={})).jitless=true'
