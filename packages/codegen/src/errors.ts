import type { DiagnosticSource } from './types.js'

/**
 * A generation failure the **input** caused: a graph with a cycle, a node
 * type no generator handles, a bundle whose paths collide. Thrown rather
 * than returned because it aborts generation, but it is a finding about the
 * workflow, not a malfunction.
 *
 * The distinction is the point. A caller that reports problems — the source
 * check, the IDE's problem list — answers these with the workflow's
 * diagnostics; anything else thrown out of a generator is a bug in the
 * generator, and has to surface as one rather than being blamed on the
 * user's workflow.
 */
export class GenerateInputError extends Error {
  /** Where the problem belongs, so it routes like any other diagnostic. */
  readonly source: DiagnosticSource
  /**
   * The file it is about, when it is about one. Without this an error in a
   * file the user wrote — two `@fetch` handlers, say — arrives with nothing
   * to point at, and the editor cannot put it on a line.
   */
  readonly path?: string

  constructor(message: string, source: DiagnosticSource = 'ir', options?: { path?: string }) {
    super(message)
    this.name = 'GenerateInputError'
    this.source = source
    if (options?.path !== undefined) this.path = options.path
  }
}

/**
 * The provider no longer has the run: its workflow is gone from the account
 * (taken down, deleted there), or the instance is (its records aged out).
 * Thrown from `getRunDetail` and `controlRun` so the caller can stop asking —
 * any other failure there is worth retrying.
 */
export class RunGoneError extends Error {
  constructor(readonly what: 'workflow' | 'instance') {
    super(
      what === 'workflow'
        ? 'The workflow is no longer on the account.'
        : 'The provider no longer has this run. It may have ended after its records were cleared.',
    )
    this.name = 'RunGoneError'
  }
}
