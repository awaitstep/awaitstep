/** What the OAuth callback put on the URL, as the Connections page receives it. */
export interface OAuthResult {
  status: string
  account?: string
  reason?: string
  connected?: boolean
}

export interface OAuthResultToast {
  tone: 'success' | 'info' | 'error'
  text: string
}

/**
 * One short line for an OAuth return. The technical detail (which scope, which
 * env var, the API log) stays in the API log; a toast is for the person who
 * clicked Connect, not for the admin reading logs.
 */
export function oauthResultToast(result: OAuthResult): OAuthResultToast {
  if (result.status === 'ok') {
    return result.connected
      ? {
          tone: 'success',
          text: result.account ? `Cloudflare connected: ${result.account}` : 'Cloudflare connected',
        }
      : { tone: 'info', text: 'OAuth finished without saving a connection' }
  }
  if (result.status === 'denied') {
    return { tone: 'info', text: 'Cloudflare connection cancelled' }
  }
  if (result.reason === 'forbidden') {
    return { tone: 'error', text: 'You no longer have permission to connect that account.' }
  }
  if (result.reason === 'multiple_accounts') {
    return {
      tone: 'error',
      text: 'That Cloudflare grant covers several accounts. Try again with one.',
    }
  }
  if (result.reason === 'invalid_scope') {
    return { tone: 'error', text: 'Cloudflare denied a permission. Check the OAuth app’s scopes.' }
  }
  if (result.reason === 'save') {
    return { tone: 'error', text: 'Couldn’t save the connection. Try again.' }
  }
  return { tone: 'error', text: 'Couldn’t connect to Cloudflare. Try again.' }
}
