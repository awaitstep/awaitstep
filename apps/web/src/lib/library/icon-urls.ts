import { API_BASE, apiPath } from '../api-path'

/** A node's icon.svg as an image URL; the hash keeps a cached copy from outliving an edit. */
export function libraryIconUrl(itemId: string, iconHash: string): string {
  return `${API_BASE}${apiPath`/library/items/${itemId}/icon`}?v=${encodeURIComponent(iconHash)}`
}

/** A marketplace node's logo, only from an https address: anything else is not drawn. */
export function marketplaceIconUrl(icon: string | null): string | undefined {
  return icon && /^https:\/\//.test(icon) ? icon : undefined
}
