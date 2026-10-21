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

  constructor(message: string, source: DiagnosticSource = 'ir') {
    super(message)
    this.name = 'GenerateInputError'
    this.source = source
  }
}
