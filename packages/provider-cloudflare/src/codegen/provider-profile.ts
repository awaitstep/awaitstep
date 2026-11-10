import { maskNonCode, withoutComments } from '@awaitstep/codegen'
import { isProjectCodePath, type ArtifactIR } from '@awaitstep/ir'
import type { CloudflareBindingKind } from '../runtime/cloudflare.js'
import {
  matchingBracket,
  parseLiteral,
  parseString,
  readIdentifier,
  skipTrivia,
  wordAt,
  ParseError,
  type ParsedLiteral,
} from './static-literal.js'

const BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const MAX_PROFILE_SOURCE = 512_000
const MAX_CALLS = 500

/** The accessor name a workflow uses, and the binding kind it declares. */
const PRIMITIVES: Record<string, CloudflareBindingKind> = {
  kv: 'kv',
  d1: 'd1',
  r2: 'r2',
  queue: 'queue',
  service: 'service',
  workflow: 'workflow',
  ai: 'ai',
  vectorize: 'vectorize',
  analyticsEngine: 'analytics_engine',
  hyperdrive: 'hyperdrive',
  browser: 'browser',
}

const BINDING_KINDS = new Set<CloudflareBindingKind>(Object.values(PRIMITIVES))

/** A declared logical binding; the physical resource is chosen per connection. */
export interface CloudflareBindingDeclaration {
  name: string
  kind: CloudflareBindingKind
  /** A non-default bucket/queue/index/service/workflow name. */
  resourceName?: string
}

/** The Cloudflare profile a workflow source declares. */
export interface CloudflareProfile {
  provider: 'cloudflare'
  bindings: CloudflareBindingDeclaration[]
  wrangler?: Record<string, unknown>
}

export interface CloudflareProfileDiagnostic {
  message: string
  offset: number
}

export interface CloudflareProfileExtraction {
  profile: CloudflareProfile | null
  usage: CloudflareBindingDeclaration[]
  diagnostics: CloudflareProfileDiagnostic[]
}

interface ImportInfo {
  define?: string
  primitives: Map<string, CloudflareBindingKind>
}

/**
 * Reads the provider profile and every binding accessor use in one source.
 *
 * This is deliberately static: a profile is data, not code that runs at
 * deploy time. Only object/array/string/number/boolean literals are accepted.
 */
export function extractCloudflareSource(source: string): CloudflareProfileExtraction {
  const imports = readImports(source)
  const diagnostics: CloudflareProfileDiagnostic[] = []
  // A normal project file must not be rejected just because it is large. Only
  // a source that actually references the Cloudflare runtime is scanned, and
  // only that source is subject to the profile size cap.
  if (!imports.define && imports.primitives.size === 0) {
    return { profile: null, usage: [], diagnostics }
  }
  if (source.length > MAX_PROFILE_SOURCE) {
    diagnostics.push({
      message: `Provider profile source is too large to scan (limit ${MAX_PROFILE_SOURCE} characters)`,
      offset: 0,
    })
    return { profile: null, usage: [], diagnostics }
  }
  const profile = imports.define ? readProfile(source, imports.define, diagnostics) : null
  const usage = readUsage(source, imports, diagnostics).filter((used) => {
    const declared = profile?.bindings.find((binding) => binding.name === used.name)
    if (!declared || declared.kind === used.kind) return true
    diagnostics.push({
      message: `Binding "${used.name}" is declared as ${declared.kind} but used as ${used.kind}`,
      offset: 0,
    })
    return false
  })
  return { profile, usage, diagnostics }
}

/**
 * Static `wrangler` overrides declared by every profile in the artifact.
 * Later profiles win; generated fields are protected when the config is built.
 */
export function cloudflareWranglerOverrides(ir: ArtifactIR): Record<string, unknown> | undefined {
  let overrides: Record<string, unknown> | undefined
  const sources: string[] = []
  for (const node of ir.nodes) {
    if (typeof node.data.code === 'string') sources.push(node.data.code)
  }
  if (ir.runtime?.triggerCode) sources.push(ir.runtime.triggerCode)
  for (const file of ir.runtime?.files ?? []) {
    if (isProjectCodePath(file.path)) sources.push(file.source)
  }
  for (const source of sources) {
    const wrangler = extractCloudflareSource(source).profile?.wrangler
    if (wrangler) overrides = { ...overrides, ...wrangler }
  }
  return overrides
}

function readImports(source: string): ImportInfo {
  const info: ImportInfo = { primitives: new Map() }
  const clean = withoutComments(source)
  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*(['"])#awaitstep\/cloudflare\2/g
  for (const match of clean.matchAll(importRe)) {
    for (const raw of match[1]!.split(',')) {
      const specifier = raw.trim()
      if (!specifier || specifier.startsWith('type ')) continue
      const [imported, alias] = specifier.split(/\s+as\s+/).map((part) => part.trim())
      if (!imported) continue
      const local = alias || imported
      if (imported === 'defineCloudflare') info.define = local
      else if (PRIMITIVES[imported]) info.primitives.set(local, PRIMITIVES[imported])
    }
  }
  return info
}

function readProfile(
  source: string,
  defineName: string,
  diagnostics: CloudflareProfileDiagnostic[],
): CloudflareProfile | null {
  const masked = maskNonCode(source)
  const call = findCalls(masked, defineName)[0]
  if (!call) return null
  const close = matchingBracket(masked, call.open, '(', ')')
  if (close === -1) {
    diagnostics.push({
      message: 'defineCloudflare() is missing its closing parenthesis',
      offset: call.open,
    })
    return null
  }

  try {
    const parsed = parseLiteral(source, call.open + 1)
    let after = skipTrivia(source, parsed.end)
    if (wordAt(source, after, 'as')) {
      const next = skipTrivia(source, after + 2)
      if (wordAt(source, next, 'const')) after = skipTrivia(source, next + 5)
      else throw new ParseError('Only "as const" is supported after defineCloudflare()', after)
    }
    if (source[after] !== ')') {
      throw new ParseError(
        'defineCloudflare() takes one object literal and no other arguments',
        after,
      )
    }
    const before = diagnostics.length
    const profile = validateProfile(parsed.value, diagnostics)
    return diagnostics.length === before ? profile : null
  } catch (error) {
    if (error instanceof ParseError) {
      diagnostics.push({ message: error.message, offset: error.offset })
    } else {
      diagnostics.push({ message: 'Could not read defineCloudflare()', offset: call.open })
    }
    return null
  }
}

function validateProfile(
  value: unknown,
  diagnostics: CloudflareProfileDiagnostic[],
): CloudflareProfile | null {
  if (!isRecord(value)) {
    diagnostics.push({ message: 'defineCloudflare() needs an object literal', offset: 0 })
    return null
  }

  for (const key of Object.keys(value)) {
    if (key !== 'bindings' && key !== 'wrangler') {
      diagnostics.push({
        message: `Unknown defineCloudflare() field "${key}"`,
        offset: 0,
      })
    }
  }

  const bindings: CloudflareBindingDeclaration[] = []
  if (value.bindings !== undefined) {
    if (!isRecord(value.bindings)) {
      diagnostics.push({ message: 'defineCloudflare().bindings must be an object', offset: 0 })
    } else {
      for (const [name, raw] of Object.entries(value.bindings)) {
        if (!BINDING_NAME.test(name)) {
          diagnostics.push({
            message: `Binding "${name}" is not a valid identifier`,
            offset: 0,
          })
          continue
        }
        if (!isRecord(raw)) {
          diagnostics.push({
            message: `Binding "${name}" must be an object with a kind`,
            offset: 0,
          })
          continue
        }
        const kind = raw.kind
        if (typeof kind !== 'string' || !BINDING_KINDS.has(kind as CloudflareBindingKind)) {
          diagnostics.push({
            message: `Binding "${name}" has an unknown kind`,
            offset: 0,
          })
          continue
        }
        if (kind === 'workflow') {
          diagnostics.push({
            message: `Binding "${name}" is a workflow binding — use a Call Workflow node instead`,
            offset: 0,
          })
          continue
        }
        if ('id' in raw || 'resourceId' in raw) {
          diagnostics.push({
            message: `Binding "${name}" cannot carry an id — map it per deployment connection`,
            offset: 0,
          })
          continue
        }
        const resourceField = RESOURCE_FIELDS[kind as CloudflareBindingKind]
        const allowed = resourceField ? new Set(['kind', resourceField]) : new Set(['kind'])
        for (const key of Object.keys(raw)) {
          if (!allowed.has(key)) {
            diagnostics.push({
              message: `Binding "${name}" has an unsupported field "${key}" for ${kind}`,
              offset: 0,
            })
          }
        }
        const resourceName = resourceField ? raw[resourceField] : undefined
        if (resourceName !== undefined && typeof resourceName !== 'string') {
          diagnostics.push({
            message: `Binding "${name}".${resourceField} must be a string`,
            offset: 0,
          })
          continue
        }
        bindings.push({
          name,
          kind: kind as CloudflareBindingKind,
          ...(resourceName ? { resourceName } : {}),
        })
      }
    }
  }

  let wrangler: Record<string, unknown> | undefined
  if (value.wrangler !== undefined) {
    if (!isRecord(value.wrangler)) {
      diagnostics.push({ message: 'defineCloudflare().wrangler must be an object', offset: 0 })
    } else {
      wrangler = value.wrangler
    }
  }

  return {
    provider: 'cloudflare',
    bindings,
    ...(wrangler && { wrangler }),
  }
}

const RESOURCE_FIELDS: Partial<Record<CloudflareBindingKind, string>> = {
  r2: 'bucket',
  queue: 'queue',
  service: 'service',
  workflow: 'workflow',
  vectorize: 'index',
}

function readUsage(
  source: string,
  imports: ImportInfo,
  diagnostics: CloudflareProfileDiagnostic[],
): CloudflareBindingDeclaration[] {
  const masked = maskNonCode(source)
  const found: CloudflareBindingDeclaration[] = []
  const seen = new Set<string>()

  for (const [local, kind] of imports.primitives) {
    for (const call of findCalls(masked, local)) {
      const close = matchingBracket(masked, call.open, '(', ')')
      if (close === -1) {
        diagnostics.push({
          message: `${local}() is missing its closing parenthesis`,
          offset: call.open,
        })
        continue
      }
      try {
        const first = skipTrivia(source, call.open + 1)
        const env = readIdentifier(source, first)
        if (!env || env.value !== 'env') {
          throw new ParseError(`${local}() needs env as its first argument`, first)
        }
        const comma = skipTrivia(source, env.end)
        if (source[comma] !== ',') {
          throw new ParseError(`${local}() needs a binding name as its second argument`, comma)
        }
        const nameStart = skipTrivia(source, comma + 1)
        let name: ParsedLiteral
        try {
          name = parseString(source, nameStart)
        } catch {
          throw new ParseError('Binding names must be string literals', nameStart)
        }
        if (typeof name.value !== 'string' || !BINDING_NAME.test(name.value)) {
          throw new ParseError('Binding names must be string literals', nameStart)
        }
        const after = skipTrivia(source, name.end)
        if (source[after] !== ')') {
          throw new ParseError(`${local}() takes env and a binding name only`, after)
        }
        const key = `${kind}:${name.value}`
        if (seen.has(key)) continue
        seen.add(key)
        found.push({ name: name.value, kind })
      } catch (error) {
        if (error instanceof ParseError) {
          diagnostics.push({ message: error.message, offset: error.offset })
        } else {
          diagnostics.push({ message: `Could not read ${local}()`, offset: call.open })
        }
      }
    }
  }

  return found
}

interface Call {
  open: number
}

function findCalls(masked: string, name: string): Call[] {
  const calls: Call[] = []
  const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g')
  for (const match of masked.matchAll(re)) {
    if (calls.length >= MAX_CALLS) break
    const index = match.index!
    const before = masked.slice(Math.max(0, index - 24), index)
    if (/\b(?:function|class)\s*$/.test(before)) continue
    if (/[{,]\s*$/.test(masked.slice(0, index).trimEnd())) continue
    if (masked.slice(0, index).trimEnd().endsWith('.')) continue
    calls.push({ open: index + match[0].length - 1 })
  }
  return calls
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
