import type { LibHost } from './project-libs'
import {
  fetchPackageTypes,
  packageLibs,
  specKey,
  type AcquiredPackage,
  type FetchLike,
  type PackageSpec,
} from './type-acquisition'

interface Installed {
  key: string
  disposables: { dispose(): void }[]
  /** Installed as a stub because the fetch failed; worth another attempt. */
  retry: boolean
}

/**
 * The declarations laid into the language services for npm packages, one
 * installation per package name: a changed range replaces the previous
 * declarations (never mixes two versions), a fetch that fails installs a
 * stub but is retried on the next ensure, and successful fetches are
 * cached per name@range for the session.
 */
export class TypeLibRegistry {
  private readonly acquisitions = new Map<string, Promise<AcquiredPackage | null>>()
  private readonly installed = new Map<string, Installed>()
  private readonly installing = new Map<string, Promise<void>>()

  constructor(private readonly fetchFn: FetchLike) {}

  /** Resolves once every spec is installed (typed or stubbed) into `hosts`. */
  async ensure(specs: readonly PackageSpec[], hosts: readonly LibHost[]): Promise<void> {
    await Promise.all(specs.map((spec) => this.ensureOne(spec, hosts)))
  }

  /** What is installed for a package, for callers that show status. */
  state(name: string): { key: string; retry: boolean } | undefined {
    const entry = this.installed.get(name)
    return entry && { key: entry.key, retry: entry.retry }
  }

  private ensureOne(spec: PackageSpec, hosts: readonly LibHost[]): Promise<void> {
    const key = specKey(spec)
    const current = this.installed.get(spec.name)
    if (current && current.key === key && !current.retry) return Promise.resolve()
    const pending = this.installing.get(spec.name)
    if (pending) return pending
    const task = this.install(spec, key, hosts).finally(() => {
      this.installing.delete(spec.name)
    })
    this.installing.set(spec.name, task)
    return task
  }

  private async install(spec: PackageSpec, key: string, hosts: readonly LibHost[]): Promise<void> {
    const acquired = await this.acquire(spec, key)
    const previous = this.installed.get(spec.name)
    for (const disposable of previous?.disposables ?? []) disposable.dispose()
    const disposables = packageLibs(spec, acquired).flatMap((lib) =>
      hosts.map((host) => host.addExtraLib(lib.content, lib.uri)),
    )
    this.installed.set(spec.name, { key, disposables, retry: acquired === null })
  }

  private acquire(spec: PackageSpec, key: string): Promise<AcquiredPackage | null> {
    let pending = this.acquisitions.get(key)
    if (!pending) {
      pending = fetchPackageTypes(spec, this.fetchFn)
        .catch(() => null)
        .then((result) => {
          // Only outcomes worth keeping are cached; a failure is retried.
          if (result === null) this.acquisitions.delete(key)
          return result
        })
      this.acquisitions.set(key, pending)
    }
    return pending
  }
}
