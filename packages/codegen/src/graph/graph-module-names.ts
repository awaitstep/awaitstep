import { maskNonCode } from './internal.js'

/**
 * Which of `names` a piece of generated or trigger code uses as code (not in
 * a comment or a string), in the order given: what the worker imports from
 * the generated graph module.
 */
export function graphModuleNames(code: string, names: readonly string[]): string[] {
  const masked = maskNonCode(code)
  return names.filter((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(masked))
}
