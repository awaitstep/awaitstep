/**
 * The editor's built-in globals: a Worker's, not a browser page's. The
 * target's default lib adds the DOM, whose `window.event` clashes with a
 * step's own `event` and wins (`event.payload` then reads as a DOM Event's).
 * fetch, Request, URL, crypto, console and timers all come with the worker lib.
 */
export const EDITOR_LIB = [
  'es2022',
  'webworker',
  'webworker.iterable',
  'webworker.asynciterable',
] as const

/**
 * The same list as the compiler options take it: file names. Monaco's
 * TypeScript worker is handed the options as they are, with no step that
 * turns `webworker` into its file, and a bare name it cannot find is dropped
 * without a word: every Worker global (fetch, Response, URL, timers) then
 * reads as undeclared.
 */
export const EDITOR_LIB_FILES = EDITOR_LIB.map((name) => `lib.${name}.d.ts`)
