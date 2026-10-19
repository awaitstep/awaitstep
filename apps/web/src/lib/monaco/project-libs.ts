import { fileLanguage } from '../ide/file-tree'
import { jsonDeclaration, jsonDeclarationPath } from './json-types'
import { workflowModelPath } from './setup'

export interface DisposableLike {
  dispose(): void
}

export interface LibHost {
  addExtraLib(content: string, uri: string): DisposableLike
}

/** Monaco runs one language service per language; each only mirrors models of its own language. */
export interface LanguageHosts {
  typescript: LibHost
  javascript: LibHost
}

export type HostName = keyof LanguageHosts

export interface ProjectLib {
  uri: string
  /** Null while the file is mid-edit and has no valid declaration yet: whatever is laid in stays. */
  content: string | null
  hosts: HostName[]
}

/**
 * What the workspace lays into the language services beside the models:
 * - a `.d.json.ts` declaration per JSON file, for both services, so
 *   `#app/data/x.json` imports are typed;
 * - in a mixed project, each JavaScript file for the TypeScript service
 *   and each TypeScript file for the JavaScript service, because a service
 *   only mirrors models of its own language and would otherwise report
 *   "Cannot find module" for a perfectly good `./util.js`.
 */
export function projectLibs(
  workflowId: string,
  files: ReadonlyMap<string, { source: string }>,
): ProjectLib[] {
  const languages = new Map([...files.keys()].map((path) => [path, fileLanguage(path)]))
  const mixed = [...languages.values()].includes('javascript')
  const libs: ProjectLib[] = []
  for (const [path, file] of files) {
    const language = languages.get(path)
    if (language === 'json') {
      libs.push({
        uri: workflowModelPath(workflowId, jsonDeclarationPath(path)),
        content: jsonDeclaration(file.source),
        hosts: ['typescript', 'javascript'],
      })
    } else if (mixed && language === 'javascript') {
      libs.push({
        uri: workflowModelPath(workflowId, path),
        content: file.source,
        hosts: ['typescript'],
      })
    } else if (mixed && language === 'typescript') {
      libs.push({
        uri: workflowModelPath(workflowId, path),
        content: file.source,
        hosts: ['javascript'],
      })
    }
  }
  return libs
}

interface Installed {
  content: string
  hosts: string
  disposables: DisposableLike[]
}

// Per workflow: the libs currently laid in and the handles that remove them.
const installed = new Map<string, Map<string, Installed>>()

/**
 * Brings the laid-in libs in step with the workspace: added, replaced when
 * their content changes, removed when the file goes. Every change restarts
 * the language workers, so callers pass a settled (debounced) file map.
 */
export function syncProjectLibs(
  hosts: LanguageHosts,
  workflowId: string,
  files: ReadonlyMap<string, { source: string }>,
): { added: string[]; removed: string[] } {
  const added: string[] = []
  const removed: string[] = []
  let current = installed.get(workflowId)
  if (!current) {
    current = new Map()
    installed.set(workflowId, current)
  }
  const wanted = new Map(projectLibs(workflowId, files).map((lib) => [lib.uri, lib]))
  for (const [uri, entry] of current) {
    const lib = wanted.get(uri)
    const unchanged =
      lib &&
      (lib.content === null || lib.content === entry.content) &&
      lib.hosts.join() === entry.hosts
    if (unchanged) continue
    for (const disposable of entry.disposables) disposable.dispose()
    current.delete(uri)
    removed.push(uri)
  }
  for (const [uri, lib] of wanted) {
    if (current.has(uri) || lib.content === null) continue
    const content = lib.content
    current.set(uri, {
      content,
      hosts: lib.hosts.join(),
      disposables: lib.hosts.map((host) => hosts[host].addExtraLib(content, uri)),
    })
    added.push(uri)
  }
  return { added, removed }
}

/** Removes every lib of the workflow (the workspace is going away). */
export function disposeProjectLibs(workflowId: string): string[] {
  const current = installed.get(workflowId)
  if (!current) return []
  const removed: string[] = []
  for (const [uri, entry] of current) {
    for (const disposable of entry.disposables) disposable.dispose()
    removed.push(uri)
  }
  installed.delete(workflowId)
  return removed
}
