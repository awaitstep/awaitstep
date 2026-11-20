import { useMemo } from 'react'
import installed from 'virtual:awaitstep/extensions'
import { isExtensionId } from '@awaitstep/ir'
import { useInstanceStore } from '../stores/instance-store'
import type { FramedExtensionPage } from '../components/navigation/dashboard-page'
import { DASHBOARD_OVERLAYS } from '../lib/dashboard-paths'
import type {
  ExtensionPage,
  ExtensionPageKey,
  ExtensionPageScope,
  ExtensionPanel,
  WebExtension,
  WebExtensionSlots,
} from './types'

/**
 * Refuses a set of extensions the dashboard could not show unambiguously: an
 * id that is not one (it would never match a feature) or one used twice. The
 * API refuses the same at startup.
 */
export function checkWebExtensions(extensions: readonly WebExtension[]): void {
  const seen = new Set<string>()
  for (const { id } of extensions) {
    if (!isExtensionId(id)) {
      throw new Error(
        `Web extension id "${id}" is not valid: use lowercase letters, digits and dashes (at most 64).`,
      )
    }
    if (seen.has(id)) throw new Error(`Web extension id "${id}" is installed twice.`)
    seen.add(id)
  }
  checkPanelIds(extensions)
}

/**
 * A panel's id is its `?open=` value: one that a built-in overlay or another
 * panel already answers would open the wrong thing.
 */
function checkPanelIds(extensions: readonly WebExtension[]): void {
  const taken = new Set<string>(DASHBOARD_OVERLAYS)
  for (const extension of extensions) {
    for (const { id } of extension.slots?.['rail.panels'] ?? []) {
      if (!isExtensionId(id)) {
        throw new Error(
          `Panel id "${id}" of web extension "${extension.id}" is not valid: use lowercase letters, digits and dashes (at most 64).`,
        )
      }
      if (taken.has(id)) {
        throw new Error(
          `Panel id "${id}" of web extension "${extension.id}" is already taken by another overlay.`,
        )
      }
      taken.add(id)
    }
  }
}

checkWebExtensions(installed)

/** The installed extensions the instance turns on, in installation order. */
export function enabledExtensions(
  all: readonly WebExtension[],
  features: readonly string[],
): WebExtension[] {
  return all.filter((extension) => features.includes(extension.id))
}

/** The extensions the dashboard shows: installed here, and listed by the API instance. */
export function useEnabledExtensions(): readonly WebExtension[] {
  const features = useInstanceStore((s) => s.features)
  return useMemo(() => enabledExtensions(installed, features), [features])
}

/** The rail panel `?open=` names, among the enabled extensions'; none for anything else. */
export function findExtensionPanel(
  enabled: readonly WebExtension[],
  open: string | undefined,
): ExtensionPanel | null {
  if (!open) return null
  for (const extension of enabled) {
    const panel = extension.slots?.['rail.panels']?.find((candidate) => candidate.id === open)
    if (panel) return panel
  }
  return null
}

/** The first enabled extension's `org.integrations`: the body of `/{org}/integrations`. */
export function findIntegrationsPage(
  enabled: readonly WebExtension[],
): WebExtensionSlots['org.integrations'] {
  for (const extension of enabled) {
    const page = extension.slots?.['org.integrations']
    if (page) return page
  }
  return undefined
}

/** An extension page's path without empty segments: `/history/` and `history` are one page. */
export function normalizeExtensionPath(path: string): string {
  return path.split('/').filter(Boolean).join('/')
}

/** The key a nav item or tab of an extension page is marked active by. */
export function extensionPageKey(id: string, path: string): ExtensionPageKey {
  return `ext:${id}/${normalizeExtensionPath(path)}`
}

export interface ResolvedExtensionPage {
  extension: WebExtension
  page: ExtensionPage
  /** What follows a nested page's path; `''` for an exact match. */
  subpath: string
}

/**
 * The page a catch-all URL names: `<id>` or `<id>/<path>` below `ext/`.
 * Only an enabled extension's page of that scope: its exact path, else the
 * nested page with the longest path the URL starts with. Anything else — or a
 * `.`/`..`/backslash segment — is no page.
 */
export function resolveExtensionPage(
  enabled: readonly WebExtension[],
  scope: ExtensionPageScope,
  splat: string | undefined,
): ResolvedExtensionPage | null {
  const [id, ...rest] = (splat ?? '').split('/')
  const segments = rest.filter(Boolean)
  // The router hands the splat over decoded: `..%2F` arrives as `../`. A page
  // never gets a segment that could climb out of where it builds a URL.
  if (segments.some(isUnsafeSegment)) return null
  const extension = enabled.find((candidate) => candidate.id === id)
  if (!extension) return null
  let best: ResolvedExtensionPage | null = null
  let bestLength = -1
  for (const page of extension.pages ?? []) {
    if (page.scope !== scope) continue
    const own = normalizeExtensionPath(page.path).split('/').filter(Boolean)
    const prefix = own.every((segment, i) => segments[i] === segment)
    if (!prefix || own.length > segments.length) continue
    const exact = own.length === segments.length
    if (!exact && !page.nested) continue
    // An exact match beats every nested one; among nested ones, the longest path.
    const length = exact ? Number.MAX_SAFE_INTEGER : own.length
    if (length > bestLength) {
      bestLength = length
      best = { extension, page, subpath: segments.slice(own.length).join('/') }
    }
  }
  return best
}

function isUnsafeSegment(segment: string): boolean {
  return segment === '.' || segment === '..' || segment.includes('\\')
}

/** What the frame names a resolved page by: its nav/tab key and its title. */
export function framedExtensionPage(
  resolved: ResolvedExtensionPage | null,
): FramedExtensionPage | undefined {
  if (!resolved) return undefined
  return {
    key: extensionPageKey(resolved.extension.id, resolved.page.path),
    title: resolved.page.title,
  }
}
