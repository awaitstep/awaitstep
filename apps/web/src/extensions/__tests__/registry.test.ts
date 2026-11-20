import { createRequire } from 'node:module'
import { CircleHelp } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import installed from 'virtual:awaitstep/extensions'
import { isInstalledCopy } from '@awaitstep/ir'
import { EXTENSIONS_PACKAGE } from '../vite-plugin'
import stub from '../stub'
import {
  checkWebExtensions,
  enabledExtensions,
  extensionPageKey,
  findExtensionPanel,
  findIntegrationsPage,
  framedExtensionPage,
  resolveExtensionPage,
} from '../registry'
import type { WebExtension } from '../types'
import { testExtension } from './fixtures/test-extension'

const other = { id: 'other', pages: [] }

// A workspace that wraps this repo links the package and runs these tests too.
// Judged the way the plugin judges it: found by resolution, and not a copy
// under node_modules (the plugin refuses those, so the build would fail).
function extensionsPackageLinked(): boolean {
  try {
    return !isInstalledCopy(createRequire(import.meta.url).resolve(`${EXTENSIONS_PACKAGE}/web`))
  } catch {
    return false
  }
}

describe('virtual:awaitstep/extensions', () => {
  it('is the stub exactly when no extensions package is linked', () => {
    expect(installed === stub).toBe(!extensionsPackageLinked())
  })

  it('lists nothing when it is the stub', () => {
    expect(stub).toEqual([])
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

  const withPanel = (extension: string, panel: string): WebExtension => ({
    id: extension,
    slots: { 'rail.panels': [{ id: panel, label: 'P', icon: CircleHelp, component: () => null }] },
  })

  it('refuses a panel id a built-in overlay already answers', () => {
    // `?open=inbox` must keep opening the Inbox.
    for (const builtIn of ['inbox', 'whats-new', 'marketplace']) {
      expect(() => checkWebExtensions([withPanel('a', builtIn)])).toThrow(
        `Panel id "${builtIn}" of web extension "a" is already taken`,
      )
    }
  })

  it('refuses the same panel id in two extensions, and an id that is not one', () => {
    expect(() => checkWebExtensions([withPanel('a', 'help'), withPanel('b', 'help')])).toThrow(
      'Panel id "help" of web extension "b" is already taken',
    )
    expect(() => checkWebExtensions([withPanel('a', 'Help me')])).toThrow('is not valid')
  })
})

describe('findIntegrationsPage', () => {
  it('is the first enabled extension’s org.integrations', () => {
    const other = () => null
    const second = { id: 'second', slots: { 'org.integrations': other } }
    expect(findIntegrationsPage([{ id: 'plain', slots: {} }, testExtension, second])).toBe(
      testExtension.slots!['org.integrations'],
    )
  })

  it('is nothing without an extension that draws it', () => {
    expect(findIntegrationsPage([])).toBeUndefined()
    expect(findIntegrationsPage([{ ...testExtension, slots: {} }])).toBeUndefined()
  })
})

describe('findExtensionPanel', () => {
  it('finds an enabled extension’s panel by its ?open= id, and nothing else', () => {
    expect(findExtensionPanel([testExtension], 'support')?.label).toBe('Support')
    expect(findExtensionPanel([testExtension], 'inbox')).toBeNull()
    expect(findExtensionPanel([testExtension], undefined)).toBeNull()
    expect(findExtensionPanel([], 'support')).toBeNull()
  })
})

describe('extensionPageKey', () => {
  it('names the same page the same way however its path is written', () => {
    expect(extensionPageKey('x', '/history/')).toBe('ext:x/history')
    expect(extensionPageKey('x', '')).toBe('ext:x/')
  })
})
