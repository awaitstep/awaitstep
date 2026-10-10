import { GeneratorRegistry } from '@awaitstep/codegen'
import type { GeneratorLookup, NodeGeneratorArgs } from '@awaitstep/codegen'
import type { BuiltinNodeType } from '@awaitstep/ir'
import { generateStep } from './generators/step.js'
import { generateSleep, generateSleepUntil } from './generators/sleep.js'
import { generateBranch } from './generators/branch.js'
import { generateParallel } from './generators/parallel.js'
import { generateHttp } from './generators/http.js'
import { generateWaitForEvent } from './generators/wait-for-event.js'
import { generateTryCatch } from './generators/try-catch.js'
import { generateLoop } from './generators/loop.js'
import { generateBreak } from './generators/break.js'
import { generateSubWorkflow } from './generators/sub-workflow.js'
import { generateSubScript } from './generators/sub-script.js'
import { generateRace } from './generators/race.js'

/**
 * The Cloudflare generator for every builtin node type. Keyed by
 * BuiltinNodeType so a new entry in BUILTIN_NODE_TYPE_LIST without a
 * generator here (or a typo'd key) is a compile error at this definition,
 * not a runtime "not yet implemented" — and duplicate keys are structurally
 * impossible.
 */
const builtinGeneratorFns: Record<BuiltinNodeType, (args: NodeGeneratorArgs) => string> = {
  step: ({ node, ctx, mode }) => generateStep(node, ctx, mode),
  sleep: ({ node }) => generateSleep(node),
  sleep_until: ({ node }) => generateSleepUntil(node),
  branch: ({ node, ir, ctx, recurse, mode }) => generateBranch(node, ir, ctx, recurse, mode),
  parallel: ({ node, ir, ctx, recurse, mode }) => generateParallel(node, ir, ctx, recurse, mode),
  http_request: ({ node, ctx, mode }) => generateHttp(node, ctx, mode),
  wait_for_event: ({ node, ctx }) => generateWaitForEvent(node, ctx),
  try_catch: ({ node, ir, ctx, recurse, mode }) => generateTryCatch(node, ir, ctx, recurse, mode),
  loop: ({ node, ir, ctx, recurse, mode }) => generateLoop(node, ir, ctx, recurse, mode),
  break: ({ node }) => generateBreak(node),
  sub_workflow: ({ node, ctx, mode }) => generateSubWorkflow(node, ctx, mode),
  sub_script: ({ node, ctx, mode }) => generateSubScript(node, ctx, mode),
  race: ({ node, ir, ctx, recurse, mode }) => generateRace(node, ir, ctx, recurse, mode),
}

/**
 * Builds a registry preloaded with the Cloudflare builtin set — the extension
 * entry point: build one, register provider-specific generators on top, and
 * pass it to generateWorkflow/generateScript via `options.generators` (or to
 * generateNodeCode directly).
 */
export function createBuiltinGeneratorRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry()
  for (const [type, generate] of Object.entries(builtinGeneratorFns)) {
    registry.register({ type, generate })
  }
  return registry
}

/**
 * Default lookup used when callers supply no registry. Sealed at the type
 * level (GeneratorLookup exposes only `get`); nothing else holds the mutable
 * reference.
 */
export const builtinGenerators: GeneratorLookup = createBuiltinGeneratorRegistry()
