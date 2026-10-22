/**
 * The cap on any API request body.
 *
 * It sits below the project-file caps, so the project total is reached
 * across requests rather than in one — documented in
 * `docs/api-reference.md`, which an agent reads before it tries to send a
 * whole project at once.
 *
 * Its own module so the number and the 413 message it appears in have one
 * home: `app.ts` enforces it and `app.test.ts` asserts against the same
 * constant. (It was also shared with the source check, which reported what a
 * `PUT /source` body could not carry — that endpoint and that rule are gone.)
 */
export const MAX_REQUEST_BYTES = 1024 * 1024
