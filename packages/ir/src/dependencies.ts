import type { ValidationError } from './types.js'

/** npm registry package-name grammar (scoped or unscoped). */
export const NPM_PACKAGE_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/**
 * Registry-only version specs: exact/caret/tilde semver (prerelease allowed),
 * `||` unions, `*`, and the common dist-tags. Deliberately excludes `file:`,
 * `git+…`, `github:…`, URLs, and tarball paths — those make `npm install`
 * read paths on the deploy host or fetch attacker-chosen hosts, so they must
 * never reach a deploy workspace.
 */
export const NPM_VERSION_RANGE_PATTERN =
  /^(\*|latest|next|canary|[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?(\s*\|\|\s*[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?)*)$/

export const MAX_WORKFLOW_DEPENDENCIES = 15

/**
 * Validates a dependency map against the registry-only grammar above. The
 * single authority for what a workflow may ask `npm install` for — enforced
 * at IR validation (save and pre-deploy) and asserted again by the deployers
 * immediately before install.
 */
export function validateDependencySpecs(
  dependencies: Record<string, string>,
  path = 'runtime.dependencies',
): ValidationError[] {
  const errors: ValidationError[] = []
  const entries = Object.entries(dependencies)

  if (entries.length > MAX_WORKFLOW_DEPENDENCIES) {
    errors.push({ path, message: `Maximum ${MAX_WORKFLOW_DEPENDENCIES} dependencies` })
  }

  for (const [name, spec] of entries) {
    if (name.length === 0 || name.length > 214 || !NPM_PACKAGE_NAME_PATTERN.test(name)) {
      errors.push({ path: `${path}.${name}`, message: `Invalid npm package name: ${name}` })
    }
    if (
      typeof spec !== 'string' ||
      spec.length === 0 ||
      spec.length > 100 ||
      !NPM_VERSION_RANGE_PATTERN.test(spec)
    ) {
      errors.push({
        path: `${path}.${name}`,
        message: `Invalid version range for ${name}: only registry semver ranges and dist-tags are allowed (e.g. ^1.0.0, ~2.3, latest)`,
      })
    }
  }

  return errors
}

/**
 * Hard stop for deployers: throws when any spec is not a plain registry
 * range. Runs immediately before a `package.json` write + `npm install`, so
 * non-registry specs (`file:`, git, URLs) can never reach an install even if
 * a caller skipped IR validation.
 */
export function assertRegistryDependencies(dependencies: Record<string, string>): void {
  const errors = validateDependencySpecs(dependencies, 'dependencies')
  if (errors.length > 0) {
    throw new Error(
      `Refusing to install non-registry dependency specs: ${errors.map((e) => e.message).join('; ')}`,
    )
  }
}
