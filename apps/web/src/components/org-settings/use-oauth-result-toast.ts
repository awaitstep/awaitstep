import { useEffect, useRef } from 'react'
import { actionToast } from '../../lib/action-toast'
import { oauthResultToast } from './oauth-result'

interface OAuthSearch {
  oauth?: string
  account?: string
  reason?: string
  connected?: string
}

/**
 * Announces a callback result once and then clears it from the URL, so a
 * refresh doesn't repeat the toast. `onShown` must be stable (a navigate
 * callback); the ref also stops React's development double-effect.
 */
export function useOAuthResultToast(search: OAuthSearch, onShown: () => void) {
  const announced = useRef<string | null>(null)
  const oauth = search.oauth

  useEffect(() => {
    if (!oauth) return
    const key = [oauth, search.account ?? '', search.reason ?? '', search.connected ?? ''].join('|')
    if (announced.current === key) return
    announced.current = key

    const message = oauthResultToast({
      status: oauth,
      account: search.account,
      reason: search.reason,
      connected: search.connected === '1',
    })
    if (message.tone === 'success') actionToast.success(message.text)
    else if (message.tone === 'error') actionToast.error(message.text)
    else actionToast.info(message.text)

    onShown()
  }, [oauth, search.account, search.reason, search.connected, onShown])
}
