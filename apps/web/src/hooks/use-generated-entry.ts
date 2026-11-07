import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import {
  FUNCTION_MODULE_PATH,
  generateScriptBundle,
  generateWorkflowBundle,
} from '@awaitstep/provider-cloudflare/codegen'
import { buildIRFromState } from '../lib/build-ir'
import { splitSecretName } from '../lib/env-var-parser'
import { useWorkflowStore } from '../stores/workflow-store'
import { useNodeTemplates } from './use-node-templates'

/** The portable graph module every workflow bundle carries. */
const WORKFLOW_MODULE_PATH = 'awaitstep/workflow.ts'

export interface GeneratedEntry {
  /** The file to show: `awaitstep/workflow.ts` or `awaitstep/function.ts`. */
  path: string | null
  source: string | null
  /** Why generation failed, when the canvas is not yet a valid graph. */
  error: string | null
}

/**
 * The graph module a deploy would build, generated from the canvas as it is
 * now — drafts included, because the preview is for the graph on screen, not
 * the last saved version.
 *
 * The bundle is generated the same way the server does it, so the file names,
 * imports and step bodies match the code workspace. Generation can fail while
 * the canvas is mid-edit (a branch with no arms, a step with bad code); the
 * error is shown in place of the preview rather than thrown at the editor.
 */
export function useGeneratedEntry(): GeneratedEntry {
  const { metadata, nodes, edges, kind, workflowEnvVars, runtimeBindings } = useWorkflowStore(
    useShallow((s) => ({
      metadata: s.metadata,
      nodes: s.nodes,
      edges: s.edges,
      kind: s.kind,
      workflowEnvVars: s.workflowEnvVars,
      runtimeBindings: s.runtimeBindings,
    })),
  )
  const templateResolver = useNodeTemplates()

  return useMemo<GeneratedEntry>(() => {
    if (nodes.length === 0) return { path: null, source: null, error: null }
    const envVarNames = workflowEnvVars.flatMap((variable) => {
      const name = splitSecretName(variable.name).name.trim()
      return name ? [name] : []
    })
    const entryPath = kind === 'script' ? FUNCTION_MODULE_PATH : WORKFLOW_MODULE_PATH
    try {
      const ir = buildIRFromState({
        metadata,
        nodes,
        edges,
        kind,
        workflowEnvVars,
        runtimeBindings,
      })
      if (kind === 'script') {
        const bundle = generateScriptBundle(ir as ScriptIR, { templateResolver, envVarNames })
        return {
          path: entryPath,
          source: bundle.files.find((file) => file.path === entryPath)?.source ?? null,
          error: null,
        }
      }
      const bundle = generateWorkflowBundle(ir as WorkflowIR, { templateResolver, envVarNames })
      const path = bundle.primary ?? entryPath
      return {
        path,
        source: bundle.files.find((file) => file.path === path)?.source ?? null,
        error: null,
      }
    } catch (error) {
      return {
        path: entryPath,
        source: null,
        error: error instanceof Error ? error.message : 'The graph could not be generated.',
      }
    }
  }, [metadata, nodes, edges, kind, workflowEnvVars, runtimeBindings, templateResolver])
}
