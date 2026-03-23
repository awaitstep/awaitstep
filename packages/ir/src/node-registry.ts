import type { NodeDefinition, Category, Provider } from './node-definition.js'

export class NodeRegistry {
  private definitions = new Map<string, NodeDefinition>()

  register(definition: NodeDefinition): void {
    this.definitions.set(definition.id, definition)
  }

  get(nodeId: string): NodeDefinition | undefined {
    return this.definitions.get(nodeId)
  }

  has(nodeId: string): boolean {
    return this.definitions.has(nodeId)
  }

  getAll(): NodeDefinition[] {
    return [...this.definitions.values()]
  }

  getByCategory(category: Category): NodeDefinition[] {
    return this.getAll().filter((d) => d.category === category)
  }

  getByProvider(provider: Provider): NodeDefinition[] {
    return this.getAll().filter((d) => d.providers.includes(provider))
  }

  remove(nodeId: string): boolean {
    return this.definitions.delete(nodeId)
  }

  clear(): void {
    this.definitions.clear()
  }

  get size(): number {
    return this.definitions.size
  }
}
