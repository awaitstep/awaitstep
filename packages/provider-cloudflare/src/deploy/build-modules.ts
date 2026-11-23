import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { WorkerBuildModule } from './deployer.js'
import { attachedModuleType } from './module-rules.js'

/**
 * The checked build in `buildDir` as the upload would send it: the bundled
 * entry first, then each attached module, by `/`-separated path.
 */
export async function readBuildModules(
  buildDir: string,
  builtEntry: string,
): Promise<{ mainModule: string; modules: WorkerBuildModule[] }> {
  const toName = (path: string) => relative(buildDir, path).split(sep).join('/')
  const mainModule = toName(builtEntry)
  if (mainModule.startsWith('../')) {
    throw new Error('The bundled entry is outside the build directory')
  }
  const modules: WorkerBuildModule[] = [
    { name: mainModule, type: 'esm', content: new Uint8Array(await readFile(builtEntry)) },
  ]
  const attached: string[] = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && attachedModuleType(entry.name)) attached.push(path)
    }
  }
  await walk(buildDir)
  for (const path of attached.sort()) {
    const name = toName(path)
    modules.push({
      name,
      type: attachedModuleType(name)!,
      content: new Uint8Array(await readFile(path)),
    })
  }
  return { mainModule, modules }
}
