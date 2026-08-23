/**
 * Template expression engine for workflow data flow — see ./expressions/ for
 * the parser (parse.ts), compiler (compile.ts), type resolver
 * (resolve-type.ts), and data walkers (find.ts). This module re-exports the
 * public surface so existing `./expressions.js` imports keep working.
 */
export * from './expressions/index.js'
