import type { ApiLibraryTree, ApiLibraryTreeFile } from '../../../../lib/library-api'

function file(path: string, readOnly = false): ApiLibraryTreeFile {
  return { path, hash: `h-${path}`, readOnly }
}

export const SOURCES: Record<string, string> = {
  'lead/index.ts': 'export function score(): number {\n  return 1\n}\n',
  'lead/package.json': '{\n  "name": "lead-scoring",\n  "version": "1.0.1"\n}\n',
  'post/1.0.0/node.json': '{\n  "id": "post",\n  "name": "Post",\n  "version": "1.0.0"\n}\n',
  'post/1.0.0/template.ts': 'export default async function (ctx) {\n  return {}\n}\n',
}

export function salesTree(over: Partial<ApiLibraryTree> = {}): ApiLibraryTree {
  return {
    owner: { kind: 'workspace', id: 'ws-sales' },
    viewerCan: { edit: { allowed: true }, create: { allowed: true } },
    projectModules: [],
    items: [
      {
        id: 'lead',
        kind: 'module',
        slug: 'lead-scoring',
        name: 'Lead scoring',
        latestVersion: '1.0.0',
        files: [file('index.ts'), file('package.json')],
      },
      {
        id: 'post',
        kind: 'node',
        slug: 'post',
        name: 'Post',
        latestVersion: '1.0.0',
        files: [file('1.0.0/node.json', true), file('1.0.0/template.ts', true)],
      },
    ],
    ...over,
  }
}

/** The tree after a write: one file at a new hash. */
export function withFile(
  tree: ApiLibraryTree,
  itemId: string,
  path: string,
  hash: string,
): ApiLibraryTree {
  return {
    ...tree,
    items: tree.items.map((item) =>
      item.id === itemId
        ? { ...item, files: item.files.map((f) => (f.path === path ? { ...f, hash } : f)) }
        : item,
    ),
  }
}
