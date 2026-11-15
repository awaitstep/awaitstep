import { useMemo, useState } from 'react'
import type { ArtifactIR, ScriptIR, WorkflowIR } from '@awaitstep/ir'
import {
  generateUniversalFunctionBundle,
  generateUniversalWorkflowBundle,
  type TemplateResolver,
} from '@awaitstep/codegen'
import {
  diffGenerated,
  type BrowserBundle,
  type PendingGenerated,
} from '../lib/ide/pending-generated'
import { useNodeTemplates } from './use-node-templates'

export interface PendingGeneratedInput {
  /** The saved version's document; null on an older version or before it loads. */
  saved: ArtifactIR | null
  /** The same with the pending graph edits replayed (the same object when there are none). */
  edited: ArtifactIR | null
  /** The workflow's kind: an older document may not carry it. */
  kind: 'workflow' | 'script'
  /**
   * The loaded generated files are older than the version (a save's refetch
   * of `/source` hasn't landed): the last overlay still describes the
   * screen, so it is kept rather than flashing the old code.
   */
  sourceLagging: boolean
}

/**
 * The generated code as Code's pending graph edits would make it, so
 * `awaitstep/workflow.ts` shows an added or removed node before Save. Only
 * while edits are pending are node templates fetched and the documents
 * generated here; the saved side is generated once per version.
 *
 * When the edited side can't be generated for a moment (a new custom
 * node's template still loading), the last overlay stays, so a tab on a
 * file only it supplies is not closed under the person.
 */
export function usePendingGenerated({
  saved,
  edited,
  kind,
  sourceLagging,
}: PendingGeneratedInput): PendingGenerated | null {
  const pending = saved !== null && edited !== null && saved !== edited
  const nodeTypes = useMemo(
    () => (pending ? [...saved.nodes, ...edited.nodes].map((node) => node.type) : []),
    [pending, saved, edited],
  )
  const templateResolver = useNodeTemplates(nodeTypes, { enabled: pending })
  const savedBundle = useMemo(
    () => (pending ? generateBundle(saved, kind, templateResolver) : null),
    [pending, saved, kind, templateResolver],
  )
  const editedBundle = useMemo(
    () => (pending ? generateBundle(edited, kind, templateResolver) : null),
    [pending, edited, kind, templateResolver],
  )
  const current = useMemo(
    () => diffGenerated(savedBundle, editedBundle),
    [savedBundle, editedBundle],
  )

  // The last overlay, for the moments it can't be worked out afresh.
  const [held, setHeld] = useState<PendingGenerated | null>(null)
  const generationFailed = pending && (savedBundle === null || editedBundle === null)
  const keep = generationFailed || (!pending && sourceLagging)
  const next = current ?? (keep ? held : null)
  if (next !== held) setHeld(next)
  return next
}

function generateBundle(
  doc: ArtifactIR,
  kind: 'workflow' | 'script',
  templateResolver: TemplateResolver,
): BrowserBundle | null {
  try {
    const options = { templateResolver, envVarNames: [] }
    const bundle =
      (doc.kind ?? kind) === 'script'
        ? generateUniversalFunctionBundle({ ...doc, kind: 'script' } as ScriptIR, options)
        : generateUniversalWorkflowBundle(doc as WorkflowIR, options)
    return { files: bundle.files, manifest: bundle.manifest ?? null }
  } catch {
    // Mid-edit graphs (or a template still loading) can fail to generate.
    return null
  }
}
