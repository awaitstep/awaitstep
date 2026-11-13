import type { RuntimeHints } from '@awaitstep/ir'

export interface TemplateResolver {
  getTemplate(nodeType: string, provider?: string): string | undefined
  /**
   * The node's `node.json` runtime hints (default retries and timeout), when
   * the resolver knows its definition. Without it, a durable template node
   * runs with the runtime's own defaults.
   */
  getRuntime?(nodeType: string): RuntimeHints | undefined
}
