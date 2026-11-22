import type { APIRoute } from 'astro'
import { llmsText } from '../content/llms'

/** A plain-text summary of the site for AI crawlers and agents (llmstxt.org). */
export const GET: APIRoute = ({ site }) =>
  new Response(llmsText(site ?? new URL('https://awaitstep.dev')), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
