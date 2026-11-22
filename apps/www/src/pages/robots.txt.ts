import type { APIRoute } from 'astro'

/** Every crawler may read every page; the sitemap lists them. */
export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('/sitemap-index.xml', site)}`, ''].join(
      '\n',
    ),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  )
