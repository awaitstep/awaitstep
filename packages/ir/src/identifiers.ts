/** ECMAScript reserved words, strict mode included: never a variable, a function or a loop item name. */
export const JS_RESERVED_WORDS: readonly string[] = [
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
]

const RESERVED = new Set(JS_RESERVED_WORDS)
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/

/** A plain JavaScript identifier that is not a reserved word. */
export function isIdentifierName(value: string): boolean {
  return IDENTIFIER_RE.test(value) && !RESERVED.has(value)
}
