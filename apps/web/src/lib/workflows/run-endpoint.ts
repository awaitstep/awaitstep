import { isBrowser } from '../utils'

/** The public run route, as documented for other systems (docs/api-reference.md). */
const RUN_PATH = '/api/run'

/**
 * Where other systems run a workflow or call a function (D-1): the API's
 * `POST /run/:id` with an API key. Every call is recorded as a run. The API
 * is served at the dashboard's own origin.
 */
export function runEndpoint(workflowId: string, origin?: string): string {
  const base = origin ?? (isBrowser ? window.location.origin : '')
  return `${base}${RUN_PATH}/${encodeURIComponent(workflowId)}`
}

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/**
 * The curl that runs it: the endpoint (with the account when one is named),
 * a placeholder for the key, and the body, quoted for a POSIX shell.
 */
export function runCurl(
  workflowId: string,
  options: { account?: string; body?: string; origin?: string } = {},
): string {
  const endpoint = runEndpoint(workflowId, options.origin)
  const url = options.account
    ? `${endpoint}?account=${encodeURIComponent(options.account)}`
    : endpoint
  return [
    `curl -X POST ${shellQuote(url)}`,
    `-H 'Authorization: Bearer <your key>'`,
    `-H 'content-type: application/json'`,
    `-d ${shellQuote(options.body ?? '{}')}`,
  ].join(' ')
}
