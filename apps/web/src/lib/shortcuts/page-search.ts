/** Marks a page's own search field, the one `/` focuses. */
export const PAGE_SEARCH_ATTRIBUTE = 'data-page-search'

/**
 * Focuses the first shown search field on the page and selects its text;
 * false when the page has none, so `/` stays the browser's (Firefox's quick
 * find). Hidden copies (the phone layout's) have no layout boxes.
 */
export function focusPageSearch(root: ParentNode = document): boolean {
  const fields = root.querySelectorAll<HTMLInputElement>(`[${PAGE_SEARCH_ATTRIBUTE}]`)
  for (const field of fields) {
    if (field.getClientRects().length === 0) continue
    field.focus()
    field.select()
    return true
  }
  return false
}
