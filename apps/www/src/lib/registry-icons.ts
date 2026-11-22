/**
 * Every registry node's icon (`registry/nodes/<id>/icon.svg`), by node id. Each is emitted as its
 * own hashed file and served from the site's origin, never inlined into the page: the integrations
 * page lists dozens, and inlined they would bloat its HTML and defeat lazy loading.
 *
 * Served as files, an icon opened directly is a document on awaitstep.dev, so the build refuses
 * one that could run script there (the registry validator applies the same rule), and `_headers`
 * sandboxes everything under `/_astro/`.
 */
import { libraryIconError } from '@awaitstep/ir'

const GLOB = '../../../../registry/nodes/*/icon.svg'
const urls = import.meta.glob<string>('../../../../registry/nodes/*/icon.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
})
const sources = import.meta.glob<string>('../../../../registry/nodes/*/icon.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const nodeId = (path: string) => path.split('/').at(-2) ?? ''

/** Each icon that may not be served, with why: `["<id>: <problem>"]`. */
export function iconProblems(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, source]) => {
    const problem = libraryIconError(source)
    return problem ? [`${nodeId(path)}: ${problem}`] : []
  })
}

const problems = iconProblems(sources)
if (problems.length > 0) throw new Error(`Unsafe registry icons (${GLOB}):\n${problems.join('\n')}`)

export const REGISTRY_ICONS: ReadonlyMap<string, string> = new Map(
  Object.entries(urls).map(([path, url]) => [nodeId(path), url]),
)
