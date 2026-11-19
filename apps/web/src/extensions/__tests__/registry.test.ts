import { describe, expect, it } from 'vitest'
import installed from 'virtual:awaitstep/extensions'
import {
  checkWebExtensions,
  enabledExtensions,
  extensionPageKey,
  framedExtensionPage,
  resolveExtensionPage,
} from '../registry'
import { testExtension } from './fixtures/test-extension'

const other = { id: 'other', pages: [] }

describe('virtual:awaitstep/extensions', () => {
  it('is the empty stub in this repository', () => {
    expect(installed).toEqual([])
  })
})

describe('enabledExtensions', () => {
  it('keeps only the installed extensions the instance lists, in installation order', () => {
    expect(enabledExtensions([testExtension, other], ['other', 'test-ext'])).toEqual([
      testExtension,
      other,
    ])
    expect(enabledExtensions([testExtension, other], ['other'])).toEqual([other])
  })

  it('shows nothing for a listed feature that is not installed, nor with no features', () => {
    expect(enabledExtensions([testExtension], ['missing'])).toEqual([])
    expect(enabledExtensions([testExtension], [])).toEqual([])
  })
})

describe('resolveExtensionPage', () => {
  const enabled = [testExtension]

  it('finds an enabled extension’s page by id, path and scope', () => {
    const resolved = resolveExtensionPage(enabled, 'workspace', 'test-ext/history')
    expect(resolved?.page.title).toBe('Assistant history')
    expect(resolveExtensionPage(enabled, 'org-settings', 'test-ext/usage')?.page.title).toBe(
      'Usage',
    )
  })

  it('ignores empty segments in the URL and in the page’s own path', () => {
    expect(resolveExtensionPage(enabled, 'workspace', 'test-ext/history/')).not.toBeNull()
    const slashed = {
      ...testExtension,
      pages: [{ ...testExtension.pages![0]!, path: '/history/' }],
    }
    expect(resolveExtensionPage([slashed], 'workspace', 'test-ext/history')?.subpath).toBe('')
  })

  it('answers deeper URLs with a nested page, handing over the rest; exact pages win', () => {
    const page = testExtension.pages![0]!
    const nested = {
      ...testExtension,
      pages: [
        { ...page, path: 'history', nested: true, title: 'All runs' },
        { ...page, path: 'history/settings', title: 'History settings' },
        { ...page, path: 'history/runs', nested: true, title: 'Runs' },
      ],
    }
    const at = (splat: string) => resolveExtensionPage([nested], 'workspace', splat)
    expect([at('test-ext/history')?.page.title, at('test-ext/history')?.subpath]).toEqual([
      'All runs',
      '',
    ])
    expect([at('test-ext/history/r_1')?.page.title, at('test-ext/history/r_1')?.subpath]).toEqual([
      'All runs',
      'r_1',
    ])
    expect(at('test-ext/history/settings')?.page.title).toBe('History settings')
    expect(at('test-ext/history/runs/r_2/log')?.subpath).toBe('r_2/log')
    expect(at('test-ext/history/runs/r_2/log')?.page.title).toBe('Runs')
  })

  it('refuses a URL that climbs with dot segments or backslashes, decoded or not', () => {
    for (const splat of [
      'test-ext/history/../../workflows',
      'test-ext/history/./r_1',
      'test-ext/history/..',
      'test-ext/history/a\\..\\b',
    ]) {
      expect(resolveExtensionPage(enabled, 'workspace', splat), splat).toBeNull()
    }
  })

  it('does not answer deeper URLs with a page that is not nested', () => {
    const flat = { ...testExtension, pages: [{ ...testExtension.pages![0]!, nested: false }] }
    expect(resolveExtensionPage([flat], 'workspace', 'test-ext/history/r_1')).toBeNull()
    expect(resolveExtensionPage(enabled, 'org-settings', 'test-ext/usage/more')).toBeNull()
  })

  it('finds no page in the wrong scope, at an unknown path, or of a disabled extension', () => {
    expect(resolveExtensionPage(enabled, 'org-settings', 'test-ext/history')).toBeNull()
    expect(resolveExtensionPage(enabled, 'workspace', 'test-ext/nope')).toBeNull()
    expect(resolveExtensionPage(enabled, 'workspace', 'test-ext')).toBeNull()
    expect(resolveExtensionPage([], 'workspace', 'test-ext/history')).toBeNull()
    expect(resolveExtensionPage(enabled, 'workspace', undefined)).toBeNull()
  })

  it('names a resolved page by its key and title', () => {
    const resolved = resolveExtensionPage(enabled, 'workspace', 'test-ext/history')
    expect(framedExtensionPage(resolved)).toEqual({
      key: extensionPageKey('test-ext', 'history'),
      title: 'Assistant history',
    })
    expect(framedExtensionPage(null)).toBeUndefined()
  })
})

describe('checkWebExtensions', () => {
  it('accepts distinct, valid ids', () => {
    expect(() => checkWebExtensions([testExtension, other])).not.toThrow()
  })

  it('refuses an id that could never match a feature', () => {
    expect(() => checkWebExtensions([{ id: 'Agent' }])).toThrow('"Agent" is not valid')
    expect(() => checkWebExtensions([{ id: 'a/b' }])).toThrow('not valid')
  })

  it('refuses the same id installed twice', () => {
    expect(() => checkWebExtensions([testExtension, testExtension])).toThrow('installed twice')
  })
})

describe('extensionPageKey', () => {
  it('names the same page the same way however its path is written', () => {
    expect(extensionPageKey('x', '/history/')).toBe('ext:x/history')
    expect(extensionPageKey('x', '')).toBe('ext:x/')
  })
})
