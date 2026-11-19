import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findPackageDir } from '../package-dir-fs'

describe('findPackageDir', () => {
  it('finds the package in a parent folder’s node_modules and returns the link’s real path', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'pkg-dir-')))
    const source = join(root, 'packages', 'ext')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'package.json'), '{"name":"@scope/ext"}')
    await mkdir(join(root, 'node_modules', '@scope'), { recursive: true })
    await symlink(source, join(root, 'node_modules', '@scope', 'ext'))
    await mkdir(join(root, 'apps', 'web', 'src'), { recursive: true })

    await expect(
      findPackageDir(join(root, 'apps', 'web', 'src', 'a.ts'), '@scope/ext'),
    ).resolves.toBe(source)
  })

  it('answers null when no folder up the tree holds it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkg-dir-'))
    await expect(findPackageDir(join(root, 'a.ts'), '@awaitstep/nothing-here')).resolves.toBeNull()
  })
})
