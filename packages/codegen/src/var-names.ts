import { sanitizeIdentifier } from './sanitize.js'

let varNameMap: Map<string, string> | null = null

export function setVarNameMap(map: Map<string, string>): void {
  varNameMap = map
}

export function clearVarNameMap(): void {
  varNameMap = null
}

export function varName(nodeId: string): string {
  if (varNameMap) {
    const name = varNameMap.get(nodeId)
    if (name) return name
  }
  return sanitizeIdentifier(nodeId)
}

export function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
