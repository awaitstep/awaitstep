import { describe, expect, it } from 'vitest'
import { isExtensionId, isInstalledCopy, isLinkedPackageEntry } from '../extension-id.js'

describe('isExtensionId', () => {
  it('accepts lowercase letters, digits and inner dashes up to 64 characters', () => {
    for (const id of ['a', 'x1', 'agent-chat', 'a'.repeat(64)]) expect(isExtensionId(id)).toBe(true)
  })

  it('refuses anything that is not one lowercase URL segment', () => {
    for (const id of [
      '',
      'A',
      'Agent',
      '-a',
      'a-',
      'a/b',
      '../x',
      'a b',
      'a'.repeat(65),
      7,
      null,
    ]) {
      expect(isExtensionId(id)).toBe(false)
    }
  })
})

describe('isInstalledCopy', () => {
  it('flags a path with a node_modules segment on either separator', () => {
    expect(isInstalledCopy('/a/node_modules/b/index.js')).toBe(true)
    expect(isInstalledCopy('C:\\a\\node_modules\\b\\index.js')).toBe(true)
  })

  it('compares the segment case-insensitively', () => {
    expect(isInstalledCopy('/a/Node_Modules/b/index.js')).toBe(true)
  })

  it('passes a path linked from source, even one that merely mentions node_modules', () => {
    expect(isInstalledCopy('/a/my_node_modules/b.js')).toBe(false)
    expect(isInstalledCopy('/work/cloud/packages/extensions/src/index.ts')).toBe(false)
  })
})

describe('isLinkedPackageEntry', () => {
  const dir = '/work/cloud/packages/extensions'

  it('takes an entry inside a linked folder', () => {
    expect(isLinkedPackageEntry(dir, `${dir}/src/index.ts`)).toBe(true)
    expect(isLinkedPackageEntry(`${dir}/`, `${dir}/src/index.ts`)).toBe(true)
  })

  it('refuses an installed folder, wherever its entry points', () => {
    expect(isLinkedPackageEntry('/home/me/node_modules/pkg', '/home/me/x.js')).toBe(false)
  })

  it('refuses an entry outside the folder, in a sibling with the same prefix, or in its node_modules', () => {
    expect(isLinkedPackageEntry(dir, '/work/cloud/packages/other/index.ts')).toBe(false)
    expect(isLinkedPackageEntry(dir, `${dir}-evil/index.ts`)).toBe(false)
    expect(isLinkedPackageEntry(dir, `${dir}/node_modules/dep/index.js`)).toBe(false)
  })

  it('refuses a filesystem root as the package folder', () => {
    expect(isLinkedPackageEntry('/', '/etc/x.js')).toBe(false)
    expect(isLinkedPackageEntry('C:\\', 'C:\\x\\y.js')).toBe(false)
  })
})
