import { access, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * The real path (symlinks followed) of the folder holding `packageName` in the
 * nearest `node_modules`, walking from the folder of `fromFile` up to `/` as
 * Node's resolution does; null when no folder on the way has it.
 */
export async function findPackageDir(
  fromFile: string,
  packageName: string,
): Promise<string | null> {
  for (let dir = dirname(fromFile); ; dir = dirname(dir)) {
    const packageDir = join(dir, 'node_modules', packageName)
    try {
      await access(join(packageDir, 'package.json'))
      return await realpath(packageDir)
    } catch {
      if (dirname(dir) === dir) return null
    }
  }
}
