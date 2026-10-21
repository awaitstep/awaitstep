/**
 * The cap on any API request body.
 *
 * It sits below the project-file caps, so the project total is reached
 * across requests rather than in one — documented in
 * `docs/api-reference.md`, which an agent reads before it tries to send a
 * whole project at once.
 *
 * Its own module because both the app (which enforces it) and the source
 * check (which reports what a write could not carry) need it, and importing
 * it from the app would close a cycle: app → routes → source → source-check.
 */
export const MAX_REQUEST_BYTES = 1024 * 1024
