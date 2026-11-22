/**
 * A page's path as its canonical URL and the nav name it: the build writes `/pricing.html` and
 * `/index.html`, the dev server serves `/pricing/` and `/`; all of them read `/pricing` and `/`.
 */
export function pagePath(pathname: string): string {
  return pathname.replace(/(?:\/index)?\.html$|\/+$/, '') || '/'
}

/**
 * JSON for an inline `<script type="application/ld+json">`: `<` is escaped so text inside the
 * data (a description with `</script>` in it) can never close the tag.
 */
export function inlineJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
