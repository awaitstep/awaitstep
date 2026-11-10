import { GeneratorRegistry } from '../node-generator.js'
import type { GeneratorLookup, NodeGeneratorArgs } from '../node-generator.js'
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
import { generateRace } from './generators/race.js'
import { generateSubWorkflow } from './generators/sub-workflow.js'
import { generateSubScript } from './generators/sub-script.js'

/**
 * The provider-neutral generator for every builtin node type. Provider
 * packages register their own primitives on top; a node type a provider adds
 * (a sub-workflow call, a service binding) is never part of this set.
 *
 * Sub-workflow and sub-script are here too: their generated code calls the
 * runtime's platform adapter, so the node is portable and each provider
 * decides how the call is carried out.
 */
const builtinGeneratorFns: Record<BuiltinNodeType, (args: NodeGeneratorArgs) => string> = {
  step: ({ node, ctx }) => generateStep(node, ctx),
  sleep: ({ node }) => generateSleep(node),
  sleep_until: ({ node }) => generateSleepUntil(node),
  branch: ({ node, ir, ctx, recurse, mode }) => generateBranch(node, ir, ctx, recurse, mode),
  parallel: ({ node, ir, ctx, recurse, mode }) => generateParallel(node, ir, ctx, recurse, mode),
  http_request: ({ node, ctx }) => generateHttp(node, ctx),
  wait_for_event: ({ node, ir, ctx, recurse, mode }) =>
    generateWaitForEvent(node, ir, ctx, recurse, mode),
  try_catch: ({ node, ir, ctx, recurse, mode }) => generateTryCatch(node, ir, ctx, recurse, mode),
  loop: ({ node, ir, ctx, recurse, mode }) => generateLoop(node, ir, ctx, recurse, mode),
  break: ({ node }) => generateBreak(node),
  sub_workflow: ({ node, ctx, mode }) => generateSubWorkflow(node, ctx, mode),
  sub_script: ({ node, ctx, mode }) => generateSubScript(node, ctx, mode),
  race: ({ node, ir, ctx, recurse, mode }) => generateRace(node, ir, ctx, recurse, mode),
}

/** Builds a registry preloaded with the provider-neutral builtin set. */
export function createBuiltinGeneratorRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry()
  for (const [type, generate] of Object.entries(builtinGeneratorFns)) {
    registry.register({ type, generate })
  }
  return registry
}

/**
 * The default lookup when callers supply no registry. Sealed at the type
 * level (GeneratorLookup exposes only `get`); nothing else holds the mutable
 * reference.
 */
export const builtinGenerators: GeneratorLookup = createBuiltinGeneratorRegistry()
