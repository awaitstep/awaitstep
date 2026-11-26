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
