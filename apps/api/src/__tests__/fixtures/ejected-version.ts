import { expect } from 'vitest'
import type { GeneratedBundle } from '@awaitstep/codegen'
import { mockDb } from '../helpers.js'

/**
 * An ejected version, built by actually ejecting.
 *
 * A checked-in bundle would be a snapshot of codegen's output, and would
 * start lying the first time codegen changed. Ejecting for real means the
 * fixture is whatever the product currently produces, which is the only
 * thing worth asserting drift against.
 */
export async function ejectVersion(
  request: (path: string, init?: RequestInit) => Response | Promise<Response>,
  workflowId = 'wf-1',
): Promise<{ versionId: string; bundle: GeneratedBundle }> {
  const res = await request(`/api/workflows/${workflowId}/eject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  expect(res.status).toBe(201)
  const { versionId } = (await res.json()) as { versionId: string }
  const version = await mockDb.getWorkflowVersionById(versionId)
  return { versionId, bundle: JSON.parse(version!.source!) as GeneratedBundle }
}

/**
 * Edits an ejected version's stored source in place, the way a user editing
 * outside the rules would. `edit` receives the stored bundle and returns
 * what to store instead.
 */
export async function rewriteStoredSource(
  versionId: string,
  edit: (bundle: GeneratedBundle) => GeneratedBundle,
): Promise<void> {
  const version = await mockDb.getWorkflowVersionById(versionId)
  const bundle = JSON.parse(version!.source!) as GeneratedBundle
  await mockDb.updateVersion(versionId, { source: JSON.stringify(edit(bundle)) })
}

/**
 * Removes a file from the stored bundle. Dropping the module a step was
 * generated into is the smallest edit that makes the stored source and the
 * graph disagree about what would ship.
 */
export function removeFile(path: string) {
  return (bundle: GeneratedBundle): GeneratedBundle => ({
    ...bundle,
    files: bundle.files.filter((file) => file.path !== path),
  })
}
