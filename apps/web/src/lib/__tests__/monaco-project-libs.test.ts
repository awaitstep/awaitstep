import { describe, expect, it } from 'vitest'
import {
  disposeProjectLibs,
  projectLibs,
  syncProjectLibs,
  type LibHost,
} from '../monaco/project-libs'

function host() {
  const libs = new Map<string, string>()
  const api: LibHost = {
    addExtraLib(content, uri) {
      libs.set(uri, content)
      return { dispose: () => libs.delete(uri) }
    },
  }
  return { api, libs }
}

describe('projectLibs', () => {
  it('declares JSON files for both services and nothing else in a TypeScript-only project', () => {
    const libs = projectLibs(
      'wf-1',
      new Map([
        ['data/countries.json', { source: '["NL"]' }],
        ['config/env.ts', { source: 'export const a = 1' }],
        ['README.md', { source: '# notes' }],
        ['data/broken.json', { source: '[' }],
      ]),
    )
    expect(libs).toEqual([
      {
        uri: 'awaitstep://workflow/wf-1/data/countries.d.json.ts',
        content: 'declare const value: string[];\nexport default value;\n',
        hosts: ['typescript', 'javascript'],
      },
      {
        uri: 'awaitstep://workflow/wf-1/data/broken.d.json.ts',
        content: null,
        hosts: ['typescript', 'javascript'],
      },
    ])
  })

  it('crosses TypeScript and JavaScript files over in a mixed project', () => {
    const libs = projectLibs(
      'wf-1',
      new Map([
        ['config/env.ts', { source: 'ts' }],
        ['legacy/util.js', { source: 'js' }],
      ]),
    )
    expect(libs).toEqual([
      { uri: 'awaitstep://workflow/wf-1/config/env.ts', content: 'ts', hosts: ['javascript'] },
      { uri: 'awaitstep://workflow/wf-1/legacy/util.js', content: 'js', hosts: ['typescript'] },
    ])
  })
})

describe('syncProjectLibs', () => {
  it('adds, keeps, replaces and removes libs as the files change', () => {
    const ts = host()
    const js = host()
    const hosts = { typescript: ts.api, javascript: js.api }
    const files = new Map([['data/countries.json', { source: '["NL"]' }]])
    const uri = 'awaitstep://workflow/wf-sync/data/countries.d.json.ts'

    expect(syncProjectLibs(hosts, 'wf-sync', files)).toEqual({ added: [uri], removed: [] })
    expect(ts.libs.get(uri)).toContain('string[]')
    expect(js.libs.get(uri)).toContain('string[]')
    expect(syncProjectLibs(hosts, 'wf-sync', files)).toEqual({ added: [], removed: [] })

    // Mid-edit JSON keeps the last good declaration in place.
    expect(
      syncProjectLibs(hosts, 'wf-sync', new Map([['data/countries.json', { source: '["NL",' }]])),
    ).toEqual({ added: [], removed: [] })
    expect(ts.libs.get(uri)).toContain('string[]')

    expect(
      syncProjectLibs(hosts, 'wf-sync', new Map([['data/countries.json', { source: '[1, 2]' }]])),
    ).toEqual({ added: [uri], removed: [uri] })
    expect(ts.libs.get(uri)).toContain('number[]')

    expect(syncProjectLibs(hosts, 'wf-sync', new Map())).toEqual({ added: [], removed: [uri] })
    expect(ts.libs.size + js.libs.size).toBe(0)
  })

  it('disposes a workflow’s libs without touching another workflow’s', () => {
    const ts = host()
    const hosts = { typescript: ts.api, javascript: host().api }
    syncProjectLibs(hosts, 'wf-a', new Map([['a.json', { source: '1' }]]))
    syncProjectLibs(hosts, 'wf-b', new Map([['b.json', { source: '2' }]]))
    expect(disposeProjectLibs('wf-a')).toEqual(['awaitstep://workflow/wf-a/a.d.json.ts'])
    expect(disposeProjectLibs('wf-a')).toEqual([])
    expect([...ts.libs.keys()]).toEqual(['awaitstep://workflow/wf-b/b.d.json.ts'])
    disposeProjectLibs('wf-b')
  })
})
