import { stableStringify } from '@awaitstep/ir'
import type { GeneratedBundle } from '@awaitstep/codegen'

/** Everything a test session's worker is built from. */
export interface TestSessionSource {
  bundle: Pick<GeneratedBundle, 'files' | 'entry' | 'primary' | 'entryClass' | 'libraryModules'>
  /**
   * The prepared document. The runner builds the wrangler config from it
   * (resource names and ids, trigger code, overrides), not only from files.
   */
  ir: unknown
  kind: 'workflow' | 'script'
  workflowName: string
  envVars?: Record<string, { value: string; isSecret: boolean }>
  dependencies?: Record<string, string>
}

/**
 * The fingerprint of what a session would run: every built file, the
 * prepared document, the variables (secret values included, so a rotated
 * secret is picked up), the dependencies and the name the config is generated
 * from. Two starts with the same fingerprint run the same thing, so the live
 * session can be handed back; anything else — a save onto the same version, a
 * project file, a published module, a variable, a resource — changes it.
 *
 * The input holds secret values and the result is stored, so `digest` is the
 * database's keyed digest: without the server key a stored fingerprint cannot
 * be checked against guesses. It is never sent to a client.
 */
export async function testSessionSourceHash(
  source: TestSessionSource,
  digest: (input: string) => Promise<string>,
): Promise<string> {
  // Entry lists, not objects: a package may be called `constructor`, which
  // stableStringify refuses as an object key. The document is serialized as
  // stored, for the same reason (its node data is the user's).
  const input = stableStringify({
    files: sortedEntries(source.bundle.files.map((file) => [file.path, file.source])),
    entry: source.bundle.entry,
    primary: source.bundle.primary ?? null,
    entryClass: source.bundle.entryClass ?? null,
    libraryModules: [...(source.bundle.libraryModules ?? [])].sort(),
    ir: JSON.stringify(source.ir),
    kind: source.kind,
    workflowName: source.workflowName,
    envVars: sortedEntries(
      Object.entries(source.envVars ?? {}).map(([name, v]) => [name, [v.value, v.isSecret]]),
    ),
    dependencies: sortedEntries(Object.entries(source.dependencies ?? {})),
  })
  return digest(input)
}

function sortedEntries<T>(entries: Array<[string, T]>): Array<[string, T]> {
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}
