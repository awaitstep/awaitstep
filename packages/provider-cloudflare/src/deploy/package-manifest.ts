import { PROJECT_IMPORTS_FIELD, parsePackageManifest } from '@awaitstep/ir'

export const DEFAULT_WORKER_PACKAGE_NAME = 'awaitstep-worker'

export function hasDependencies(
  dependencies?: Record<string, string>,
): dependencies is Record<string, string> {
  return !!dependencies && Object.keys(dependencies).length > 0
}

export interface WorkerPackageJsonInput {
  /** Fallback name when the project's package.json does not set one. */
  name: string
  /** The resolved dependency set (project manifest + node templates), already validated. */
  dependencies?: Record<string, string>
  /** The project's own package.json source, if the bundle carries one. */
  manifestSource?: string
}

/**
 * The package.json every deploy directory gets. A project-owned manifest
 * contributes its honoured fields (name, version, description, license,
 * engines, extra `#` import entries); the deploy always forces `private`,
 * ESM, the `#/*` root alias and the resolved dependency set, so nothing in
 * the user's file can redirect the install or change how code resolves.
 */
export function buildWorkerPackageJson(input: WorkerPackageJsonInput): string {
  const user = input.manifestSource ? parsePackageManifest(input.manifestSource) : null
  const manifest = {
    name: user?.name ?? input.name,
    ...(user?.version && { version: user.version }),
    ...(user?.description && { description: user.description }),
    ...(user?.license && { license: user.license }),
    private: true,
    type: 'module',
    ...(user?.engines && { engines: user.engines }),
    imports: { ...user?.imports, ...PROJECT_IMPORTS_FIELD },
    ...(hasDependencies(input.dependencies) && { dependencies: input.dependencies }),
  }
  return JSON.stringify(manifest, null, 2)
}
