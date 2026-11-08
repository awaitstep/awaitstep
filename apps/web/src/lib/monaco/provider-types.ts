import type { Monaco } from '@monaco-editor/react'
import { CLOUDFLARE_MODULES_DTS } from './awaitstep-modules'
import { CF_RUNTIME_DTS } from './cf-runtime-dts'

/** The provider syntax packs the editor knows. */
export type ProviderTypeId = 'cloudflare' | null

const CLOUDFLARE_TYPE_PACK = `${CF_RUNTIME_DTS}
${CLOUDFLARE_MODULES_DTS}
declare module 'cloudflare:*';
`

const LIB_URI = 'file:///awaitstep/provider-types.d.ts'

const owners = new Map<string, ProviderTypeId>()
let active: {
  id: ProviderTypeId
  monaco: Monaco
  dispose: { dispose(): void }
} | null = null

function effectiveId(): ProviderTypeId {
  return [...owners.values()].includes('cloudflare') ? 'cloudflare' : null
}

function apply(monaco: Monaco, id: ProviderTypeId): void {
  if (active?.id === id && active.monaco === monaco) return
  active?.dispose.dispose()
  active = null
  if (id === null) return
  const source = id === 'cloudflare' ? CLOUDFLARE_TYPE_PACK : ''
  if (!source) return
  const dispose = monaco.languages.typescript.typescriptDefaults.addExtraLib(source, LIB_URI)
  const disposeJs = monaco.languages.typescript.javascriptDefaults.addExtraLib(source, LIB_URI)
  active = {
    id,
    monaco,
    dispose: {
      dispose: () => {
        dispose.dispose()
        disposeJs.dispose()
      },
    },
  }
}

/**
 * Loads a provider pack on behalf of one editor owner. Two writers (the
 * canvas IR and the project files) must not clobber each other: the pack is
 * the union of every owner's hint, and the neutral pack returns only when
 * the last owner is neutral.
 */
export function setProviderTypePackFor(owner: string, monaco: Monaco, id: ProviderTypeId): void {
  owners.set(owner, id)
  apply(monaco, effectiveId())
}

export function clearProviderTypePack(owner: string, monaco: Monaco): void {
  owners.delete(owner)
  apply(monaco, effectiveId())
}

/**
 * Back-compat single-owner entry point. Prefer {@link setProviderTypePackFor}
 * in a surface that shares Monaco with another.
 */
export function setProviderTypePack(monaco: Monaco, id: ProviderTypeId): void {
  setProviderTypePackFor('default', monaco, id)
}

/** Test/workspace reset: drops every owner's pack and the active library. */
export function resetProviderTypePacks(): void {
  owners.clear()
  active?.dispose.dispose()
  active = null
}

/**
 * The provider whose syntax appears in the project, or null for the neutral
 * pack. Detection is deliberately syntax-first: an untouched project gets no
 * provider globals, while a file that imports `#awaitstep/cloudflare` or
 * `cloudflare:*` gets exactly that provider's types.
 */
export function providerTypeHintFromSources(sources: Iterable<string>): ProviderTypeId {
  for (const source of sources) {
    if (source.includes('#awaitstep/cloudflare') || /(^|[^A-Za-z0-9_])cloudflare:/.test(source)) {
      return 'cloudflare'
    }
  }
  return null
}

const CLOUDFLARE_BINDINGS = new Set([
  'kv',
  'd1',
  'r2',
  'queue',
  'service',
  'ai',
  'vectorize',
  'analytics_engine',
  'hyperdrive',
  'browser',
])

/** A hint from declared resources, for the canvas where no project file exists yet. */
export function providerTypeHintFromBindings(
  bindings: ReadonlyArray<{ kind: string }>,
): ProviderTypeId {
  return bindings.some((binding) => CLOUDFLARE_BINDINGS.has(binding.kind)) ? 'cloudflare' : null
}
