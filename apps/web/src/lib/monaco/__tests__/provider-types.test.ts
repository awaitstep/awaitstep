import { afterEach, describe, expect, it } from 'vitest'
import {
  clearProviderTypePack,
  resetProviderTypePacks,
  setProviderTypePackFor,
} from '../provider-types'

function fakeMonaco() {
  const libs = new Map<string, string>()
  const host = {
    addExtraLib(source: string, uri: string) {
      libs.set(uri, source)
      return { dispose: () => libs.delete(uri) }
    },
  }
  return {
    libs,
    monaco: {
      typescript: { typescriptDefaults: host, javascriptDefaults: host },
    } as never,
  }
}

afterEach(() => resetProviderTypePacks())

describe('provider type packs', () => {
  it('offers no `step` global: a step does not start another', () => {
    const { libs, monaco } = fakeMonaco()
    setProviderTypePackFor('canvas', monaco, 'cloudflare')
    const pack = [...libs.values()][0]!
    expect(pack).not.toContain('declare const step')
    expect(pack).toContain('interface WorkflowStep')
  })

  it('keeps the provider pack while another owner is neutral', () => {
    const { libs, monaco } = fakeMonaco()
    setProviderTypePackFor('canvas', monaco, 'cloudflare')
    setProviderTypePackFor('project', monaco, null)
    expect(libs.size).toBe(1)
    clearProviderTypePack('project', monaco)
    expect(libs.size).toBe(1)
    clearProviderTypePack('canvas', monaco)
    expect(libs.size).toBe(0)
  })

  it('loads the pack when a neutral owner is joined by a provider owner', () => {
    const { libs, monaco } = fakeMonaco()
    setProviderTypePackFor('project', monaco, null)
    expect(libs.size).toBe(0)
    setProviderTypePackFor('canvas', monaco, 'cloudflare')
    expect(libs.size).toBe(1)
  })
})
