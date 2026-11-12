import { describe, expect, it } from 'vitest'
import {
  compareLibraryVersions,
  libraryFilePathError,
  libraryIconError,
  libraryImportSlugs,
  libraryItemCapabilities,
  libraryCreateCapability,
  libraryItemScaffold,
  libraryOwnerRole,
  nextPatchVersion,
  nodeVersionFolder,
} from '../library.js'
import {
  moduleVersionChoice,
  nodeVersionChoice,
  validateCustomNodeManifest,
} from '../library-versions.js'

describe('library file paths', () => {
  it('lets a module hold code and data files with its package.json at the root', () => {
    expect(libraryFilePathError('module', 'index.ts')).toBeNull()
    expect(libraryFilePathError('module', 'lib/score.ts')).toBeNull()
    expect(libraryFilePathError('module', 'package.json')).toBeNull()
    expect(libraryFilePathError('module', 'lib/package.json')).toMatch(/module root/)
    expect(libraryFilePathError('module', 'pnpm-lock.yaml')).toMatch(/toolchain/)
    expect(libraryFilePathError('module', 'node_modules/x/index.js')).toMatch(/toolchain/)
    expect(libraryFilePathError('module', '../x.ts')).toMatch(/unsafe/)
    expect(libraryFilePathError('module', 'icon.svg')).toMatch(/must end in/)
  })

  it('keeps a node to icon.svg at the root and files in version folders', () => {
    expect(libraryFilePathError('node', 'icon.svg')).toBeNull()
    expect(libraryFilePathError('node', '1.0.0/node.json')).toBeNull()
    expect(libraryFilePathError('node', '1.0.0/template.ts')).toBeNull()
    expect(libraryFilePathError('node', '2.10.3/lib/helpers.ts')).toBeNull()
    expect(libraryFilePathError('node', 'template.ts')).toMatch(/version folder/)
    expect(libraryFilePathError('node', 'v1/template.ts')).toMatch(/version folder/)
    expect(libraryFilePathError('node', '1.0/template.ts')).toMatch(/version folder/)
    expect(libraryFilePathError('node', '1.0.0/package.json')).toMatch(/node\.json/)
    expect(libraryFilePathError('node', '1.0.0/icon.svg')).toMatch(/must end in/)
  })

  it('reads the version folder of a node path', () => {
    expect(nodeVersionFolder('1.2.0/node.json')).toBe('1.2.0')
    expect(nodeVersionFolder('icon.svg')).toBeNull()
    expect(nodeVersionFolder('01.2.0/node.json')).toBeNull()
  })

  it('accepts an SVG icon and refuses anything else or anything too large', () => {
    expect(libraryIconError('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull()
    expect(libraryIconError('<?xml version="1.0"?>\n<!-- x -->\n<svg></svg>')).toBeNull()
    expect(libraryIconError('<html><svg></svg></html>')).toMatch(/SVG document/)
    expect(libraryIconError(`<svg>${'a'.repeat(40_000)}</svg>`)).toMatch(/exceeds/)
    expect(libraryIconError('<svg><script>alert(1)</script></svg>')).toMatch(/scripts/)
    expect(libraryIconError('<svg onload="x()"></svg>')).toMatch(/event handlers/)
    expect(libraryIconError('<svg><a href="javascript:x()"/></svg>')).toMatch(/scripts/)
    expect(libraryIconError('<svg><foreignObject/></svg>')).toMatch(/embedded/)
    expect(libraryIconError('<?xml version="1.0"?><svg')).toMatch(/SVG document/)
    expect(libraryIconError('<!-- open')).toMatch(/SVG document/)
    // The encoded and data: ways around those patterns are refused too.
    expect(libraryIconError('<svg><a href="jav&#x61;script:x()"/></svg>')).toMatch(/scripts/)
    expect(libraryIconError('<svg><use href="data:image/svg+xml,x"/></svg>')).toMatch(/scripts/)
  })

  it('judges an icon in linear time, however many comments lead it', () => {
    const started = performance.now()
    expect(libraryIconError(`${'<!---->'.repeat(1_000)}x`)).toMatch(/SVG document/)
    expect(libraryIconError(`${'<!-- a -->'.repeat(1_000)}<svg></svg>`)).toBeNull()
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('library versions', () => {
  it('orders versions numerically, not as text', () => {
    expect(compareLibraryVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareLibraryVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareLibraryVersions('0.9.9', '1.0.0')).toBeLessThan(0)
    expect(nextPatchVersion('1.4.9')).toBe('1.4.10')
  })

  it('publishes a module at its declared version, the next patch when it repeats the latest', () => {
    expect(moduleVersionChoice('1.0.0', null)).toEqual({ ok: true, version: '1.0.0' })
    expect(moduleVersionChoice('1.4.1', '1.4.1')).toEqual({
      ok: true,
      version: '1.4.2',
      bumpedFrom: '1.4.1',
    })
    expect(moduleVersionChoice('2.0.0', '1.4.1')).toEqual({ ok: true, version: '2.0.0' })
    expect(moduleVersionChoice('1.3.0', '1.4.1')).toMatchObject({ ok: false, code: 'lower' })
    expect(moduleVersionChoice(undefined, null)).toMatchObject({ ok: false, code: 'invalid' })
    expect(moduleVersionChoice('1.0', null)).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('publishes a node from its one unpublished folder, above the latest', () => {
    expect(nodeVersionChoice(['1.0.1'], '1.0.0')).toEqual({ ok: true, version: '1.0.1' })
    expect(nodeVersionChoice(['1.0.0'], null)).toEqual({ ok: true, version: '1.0.0' })
    expect(nodeVersionChoice([], '1.0.0')).toMatchObject({ ok: false, code: 'invalid' })
    expect(nodeVersionChoice(['1.0.1', '1.0.2'], null)).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    expect(nodeVersionChoice(['0.9.0'], '1.0.0')).toMatchObject({ ok: false, code: 'lower' })
  })
})

describe('custom node manifests', () => {
  const [manifest] = libraryItemScaffold('node', { slug: 'post-slack', name: 'Post to Slack' })

  it('accepts the scaffold and fills in author, licence and providers', () => {
    const result = validateCustomNodeManifest(manifest!.source, '1.0.0', '1.0.0/node.json')
    expect(result.errors).toEqual([])
    expect(result.definition).toMatchObject({
      id: 'post-slack',
      author: 'custom',
      license: 'UNLICENSED',
      providers: ['cloudflare'],
    })
  })

  it('refuses a version that is not its folder, and names each schema problem', () => {
    expect(validateCustomNodeManifest(manifest!.source, '1.0.1', '1.0.1/node.json').errors).toEqual(
      [
        {
          path: '1.0.1/node.json.version',
          message: 'version "1.0.0" must match its folder 1.0.1',
        },
      ],
    )
    const bad = JSON.stringify({ ...JSON.parse(manifest!.source), runtime: 'workers' })
    const { errors } = validateCustomNodeManifest(bad, '1.0.0', '1.0.0/node.json')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]!.path).toMatch(/^1\.0\.0\/node\.json/)
    expect(validateCustomNodeManifest('{', '1.0.0', 'x').errors[0]!.message).toMatch(/JSON/)
  })
})

describe('library item capabilities', () => {
  it('lets editors change an item and keeps a project item read-only to the workspaces that use it', () => {
    expect(libraryItemCapabilities('editor').edit).toEqual({ allowed: true })
    expect(libraryItemCapabilities('viewer').edit).toEqual({
      allowed: false,
      reason: 'Changing library items needs an Editor',
    })
    expect(libraryItemCapabilities(null).edit).toEqual({
      allowed: false,
      reason: 'From the project’s library. Only project members change it',
    })
  })

  it('lets editors add an item, and says why a viewer or a workspace-only person cannot', () => {
    expect(libraryCreateCapability('editor')).toEqual({ allowed: true })
    expect(libraryCreateCapability('viewer').reason).toBe('Changing library items needs an Editor')
    expect(libraryCreateCapability(null).reason).toBe(
      'Only the project’s members can add to its library',
    )
  })

  it('reads a project item’s role off the project role', () => {
    expect(
      libraryOwnerRole({ workspaceId: null }, { projectRole: 'member', workspaceRole: null }),
    ).toBe('editor')
    expect(
      libraryOwnerRole({ workspaceId: 'w' }, { projectRole: 'admin', workspaceRole: 'viewer' }),
    ).toBe('viewer')
    expect(
      libraryOwnerRole({ workspaceId: null }, { projectRole: null, workspaceRole: 'admin' }),
    ).toBeNull()
  })
})

describe('library imports and scaffolds', () => {
  it('finds every #modules slug, subpaths and dynamic imports included', () => {
    expect(
      libraryImportSlugs([
        "import { score } from '#modules/lead-scoring'\n",
        'const x = await import("#modules/fmt/dates")\nimport "#modules/lead-scoring"',
        "import y from '#app/lib/x'",
      ]),
    ).toEqual(['fmt', 'lead-scoring'])
  })

  it('starts a module as a package at 1.0.0', () => {
    const files = libraryItemScaffold('module', { slug: 'lead-scoring', name: 'Lead scoring' })
    expect(files.map((f) => f.path)).toEqual(['package.json', 'index.ts'])
    expect(JSON.parse(files[0]!.source)).toMatchObject({ name: 'lead-scoring', version: '1.0.0' })
    // The scaffold names its import path without importing itself.
    expect(libraryImportSlugs(files.map((f) => f.source))).toEqual([])
  })
})
