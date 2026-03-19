export interface TemplateResolver {
  getTemplate(nodeType: string, provider: string): string | undefined
}
