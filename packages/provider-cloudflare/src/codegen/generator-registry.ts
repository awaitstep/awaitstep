import { GeneratorRegistry, type GeneratorLookup } from '@awaitstep/codegen'
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
 * The Cloudflare provider's builtin generator set. Registered once at module
 * load; dispatch in generate-helpers looks node types up here, with custom
 * (registry/marketplace) nodes falling back to template resolution.
 */
export function createBuiltinGeneratorRegistry(): GeneratorRegistry {
  return new GeneratorRegistry()
    .register({ type: 'step', generate: ({ node, ctx, mode }) => generateStep(node, ctx, mode) })
    .register({ type: 'sleep', generate: ({ node }) => generateSleep(node) })
    .register({ type: 'sleep_until', generate: ({ node }) => generateSleepUntil(node) })
    .register({
      type: 'branch',
      generate: ({ node, ir, recurse }) => generateBranch(node, ir, recurse),
    })
    .register({
      type: 'parallel',
      generate: ({ node, ir, ctx, recurse, mode }) =>
        generateParallel(node, ir, ctx, recurse, mode),
    })
    .register({
      type: 'http_request',
      generate: ({ node, ctx, mode }) => generateHttp(node, ctx, mode),
    })
    .register({
      type: 'wait_for_event',
      generate: ({ node, ctx }) => generateWaitForEvent(node, ctx),
    })
    .register({
      type: 'try_catch',
      generate: ({ node, ir, recurse }) => generateTryCatch(node, ir, recurse),
    })
    .register({
      type: 'loop',
      generate: ({ node, ir, ctx, recurse, mode }) => generateLoop(node, ir, ctx, recurse, mode),
    })
    .register({ type: 'break', generate: ({ node }) => generateBreak(node) })
    .register({
      type: 'sub_workflow',
      generate: ({ node, ctx, mode }) => generateSubWorkflow(node, ctx, mode),
    })
    .register({
      type: 'sub_script',
      generate: ({ node, ctx, mode }) => generateSubScript(node, ctx, mode),
    })
    .register({
      type: 'race',
      generate: ({ node, ir, ctx, recurse, mode }) => generateRace(node, ir, ctx, recurse, mode),
    })
}

/**
 * Shared lookup used by dispatch. Typed lookup-only so no importer can
 * register into the module-level instance — per-generation extension goes
 * through createBuiltinGeneratorRegistry() and a locally built registry.
 */
export const builtinGenerators: GeneratorLookup = createBuiltinGeneratorRegistry()
