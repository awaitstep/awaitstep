import type { ArtifactIR, ValidationError } from '@awaitstep/ir'
import type { GeneratedBundle, StepKind, StepManifest } from '@awaitstep/codegen'
import { bundleCodeFiles, validateBundle } from '@awaitstep/codegen'

/**
 * Drift validation for user-edited bundles (ejected/sdk source modes):
 * consistency with the IR and step manifest, not equality — edits inside
 * node regions are the point of ejecting.
 *
 * Checks:
 * - the bundle passes structural validation (safe paths, entry present);
 * - every manifest node still exists in the IR (a canvas deletion is a
 *   structural edit that requires regenerate-or-revert, not a source push);
 * - every manifest module file is still present;
 * - every step's labeled primitive (`step.do("<label>"`, `step.sleep(...)`,
 *   `step.waitForEvent(...)` per its manifest kind) survives somewhere in
 *   the code (labels are derived from node ids — relabeling a step breaks
 *   run telemetry and Cloudflare's step identity);
 * - inline node regions keep their `// @awaitstep:node <id>` marker in the
 *   entry (module-backed nodes are scoped by their file instead).
 *
 * Transpile/expression checks stay in the deploy pipeline — this module is
 * pure and browser-safe.
 */
const PRIMITIVES_BY_KIND: Record<StepKind, string[]> = {
  do: ['step.do'],
  sleep: ['step.sleep', 'step.sleepUntil'],
  waitForEvent: ['step.waitForEvent'],
}

// Quote-insensitive so a formatter switching to single quotes doesn't read
// as a relabeled step; labels are charset-safe (node-id derived) so no
// escaping is needed. (AST-level checking is the durable follow-up.)
function labelSurvives(code: string, label: string, kind: StepKind | undefined): boolean {
  return PRIMITIVES_BY_KIND[kind ?? 'do'].some(
    (method) => code.includes(`${method}("${label}"`) || code.includes(`${method}('${label}'`),
  )
}

export function validateSource(
  ir: ArtifactIR,
  bundle: GeneratedBundle,
  manifest: StepManifest,
): ValidationError[] {
  const errors: ValidationError[] = []

  try {
    validateBundle(bundle)
  } catch (err) {
    errors.push({
      path: 'source',
      message: err instanceof Error ? err.message : 'Invalid bundle structure',
    })
    return errors
  }

  const irNodeIds = new Set(ir.nodes.map((n) => n.id))
  const filesByPath = new Map(bundle.files.map((f) => [f.path, f]))
  const entry = filesByPath.get(bundle.entry)
  const allCode = bundleCodeFiles(bundle)
    .map((f) => f.source)
    .join('\n')

  for (const step of manifest.steps) {
    if (!irNodeIds.has(step.nodeId)) {
      errors.push({
        path: `manifest.steps.${step.nodeId}`,
        message: `Node "${step.nodeId}" was removed from the workflow — regenerate the source or revert to visual mode`,
        nodeId: step.nodeId,
      })
      continue
    }

    if (step.filePath) {
      if (!filesByPath.has(step.filePath)) {
        errors.push({
          path: `source.${step.filePath}`,
          message: `Module file for step "${step.stepName}" is missing (${step.filePath})`,
          nodeId: step.nodeId,
        })
        continue
      }
    } else if (entry && !entry.source.includes(`// @awaitstep:node ${step.nodeId}`)) {
      errors.push({
        path: `source.${bundle.entry}`,
        message: `Region marker for node "${step.nodeId}" is missing from the entry — restore "// @awaitstep:node ${step.nodeId}"`,
        nodeId: step.nodeId,
      })
      continue
    }

    if (step.stepName !== undefined && !labelSurvives(allCode, step.stepName, step.kind)) {
      const method = PRIMITIVES_BY_KIND[step.kind ?? 'do'][0]!
      errors.push({
        path: `source`,
        message: `${method}("${step.stepName}") no longer appears in the source — removing or relabeling steps breaks run telemetry; edit the body, not the label`,
        nodeId: step.nodeId,
      })
    }
  }

  return errors
}
