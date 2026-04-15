import { readFile } from 'node:fs/promises'
import { buildNodeRegistry, type AppNodeRegistry, type RegistryFile } from './node-registry.js'

export async function loadNodeRegistry(registryPath: string): Promise<AppNodeRegistry> {
  const raw = await readFile(registryPath, 'utf-8')
  const data = JSON.parse(raw) as RegistryFile
  return buildNodeRegistry(data)
}
