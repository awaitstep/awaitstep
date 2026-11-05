import { contentHash, projectBundleFiles } from '@awaitstep/codegen'
import type { SourceDiagnostic, DiagnosticSource } from '@awaitstep/codegen'
import { collectCompileErrors } from '@awaitstep/codegen/transpile'
import { PACKAGE_MANIFEST_PATH, validatePackageManifest } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import { escapingImports } from './import-check.js'

/**
 * The source of a workflow that has no saved version yet.
 *
 * Generated code comes from a version's graph, so there is none to show; the
 * project's own files do not depend on a version and are the whole answer.
 * This is the one place that says what "no version" means for a read — the
 * strict prepare (deploy, test session, local dev) keeps refusing instead.
 * Nothing is persisted.
 */
export interface BlankSource {
  versionId: null
  entry: null
  primary: null
  files: { path: string; source: string; role: string; hash: string }[]
  manifest: null
  requirements: []
  diagnostics: SourceDiagnostic[]
}

/** True when a read of this workflow has no version to generate from. */
export function hasNoVersion(workflow: Workflow, requestedVersionId: string | undefined): boolean {
  return !requestedVersionId && !workflow.currentVersionId
}

/** The one refusal text for everything that needs a version, whoever the caller is. */
export const NO_VERSION_MESSAGE = 'No saved version. Save a version first.'

/** What a check says when there is nothing to deploy: the same wording the refusals use. */
export const NO_VERSION_DIAGNOSTIC: SourceDiagnostic = {
  source: 'ir',
  message: NO_VERSION_MESSAGE,
}

/** The checks that need no version: they judge the project's own files. */
export const BLANK_CHECKED: DiagnosticSource[] = ['compile', 'import']

/**
 * Findings about a blank workflow's own files — the part of a strict prepare
 * that does not read a graph: files that do not parse, a package.json the
 * write rules would refuse, imports that climb out of the project. Unresolved
 * `#app/` imports are left out: they may name a generated file that only
 * exists after the first save.
 */
export async function projectFileDiagnostics(
  files: readonly { path: string; source: string; role: string }[],
): Promise<SourceDiagnostic[]> {
  const diagnostics: SourceDiagnostic[] = []
  const code = files.filter((file) => file.role === 'module')
  for (const error of await collectCompileErrors(code)) {
    diagnostics.push({ source: 'compile', message: error.message, path: error.path })
  }
  const manifest = files.find((file) => file.path === PACKAGE_MANIFEST_PATH)
  if (manifest) {
    for (const error of validatePackageManifest(manifest.source)) {
      diagnostics.push({ source: 'compile', message: error.message, path: manifest.path })
    }
  }
  for (const escape of escapingImports(code)) {
    diagnostics.push({
      source: 'import',
      message: `"${escape.specifier}" reaches outside the project — imports must stay inside it`,
      path: escape.path,
    })
  }
  return diagnostics
}

export async function readBlankSource(
  db: DatabaseAdapter,
  workflow: Workflow,
): Promise<BlankSource> {
  const stored = await db.listWorkflowFiles(workflow.id)
  const bundled = projectBundleFiles(stored.map(({ path, source }) => ({ path, source })))
  return {
    versionId: null,
    entry: null,
    primary: null,
    files: bundled.map((file) => ({ ...file, hash: contentHash(file.source) })),
    manifest: null,
    requirements: [],
    diagnostics: await projectFileDiagnostics(bundled),
  }
}
