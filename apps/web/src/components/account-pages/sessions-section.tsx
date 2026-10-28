import { useState } from 'react'
import { Monitor, Smartphone, SquareTerminal } from 'lucide-react'
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '../../data/dashboard/account'
import { handleSignOut } from '../../lib/auth-client'
import { plural } from '../../lib/plural'
import type { AccountSession } from '../../types/dashboard/account'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ListCard, ListRow } from '../ui/list-card'
import { SectionHeader } from '../ui/section-header'
import { Tile } from '../ui/tile'
import { LoadedQuery } from '../workspaces/loaded-query'
import { sessionActivity, sessionDetail } from './account-format'

const DEVICE_ICON = {
  desktop: <Monitor />,
  phone: <Smartphone />,
  terminal: <SquareTerminal />,
}

const DANGER_OUTLINE = 'border-destructive/40 text-status-error'

/** Which sign-out the dialog asks about: one other device, or all of them. */
type Asking = { kind: 'one'; session: AccountSession } | { kind: 'others'; count: number }

/** Active sessions (`AccountSessions`): sign out another device, or every other one. */
export function SessionsSection() {
  const sessions = useSessions()
  const revokeOne = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()
  const [asking, setAsking] = useState<Asking | null>(null)
  const list = sessions.data
  const others = list?.filter((s) => !s.current).length ?? 0

  function handleAskOne(session: AccountSession) {
    revokeOne.reset()
    setAsking({ kind: 'one', session })
  }

  function handleAskOthers() {
    revokeOthers.reset()
    setAsking({ kind: 'others', count: others })
  }

  function handleOpenChange(open: boolean) {
    if (!open) setAsking(null)
  }

  function handleConfirm() {
    if (!asking) return
    const close = { onSuccess: () => setAsking(null) }
    if (asking.kind === 'one') revokeOne.mutate(asking.session.id, close)
    else revokeOthers.mutate(undefined, close)
  }

  const pending = revokeOne.isPending || revokeOthers.isPending
  const failed = asking?.kind === 'one' ? revokeOne.error : revokeOthers.error

  return (
    <section className="settings-width flex flex-col gap-3">
      <SectionHeader
        title="Active sessions"
        caption={list && plural(list.length, 'session')}
        action={
          others > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={DANGER_OUTLINE}
              onClick={handleAskOthers}
            >
              Sign out all other sessions
            </Button>
          )
        }
      />
      <LoadedQuery query={sessions} what="sessions">
        {(data) => (
          <ListCard label="Active sessions" empty="No sessions.">
            {data.map((session) => (
              <SessionRow key={session.id} session={session} onAsk={handleAskOne} />
            ))}
          </ListCard>
        )}
      </LoadedQuery>
      <p className="text-2xs text-muted-foreground">
        Sessions last 7 days without use. Don’t recognise one? Sign it out, then check Sign-in
        methods above.
      </p>
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={handleOpenChange}
          title={
            asking.kind === 'one'
              ? `Sign out ${asking.session.device}?`
              : `Sign out ${plural(asking.count, 'other session')}?`
          }
          description={
            failed?.message ??
            (asking.kind === 'one'
              ? 'That device is signed out right away and has to sign in again.'
              : 'Every device except this one is signed out right away. You stay signed in here.')
          }
          confirmLabel={asking.kind === 'one' ? 'Sign out' : 'Sign out others'}
          variant="destructive"
          onConfirm={handleConfirm}
          loading={pending}
        />
      )}
    </section>
  )
}

interface SessionRowProps {
  session: AccountSession
  onAsk: (session: AccountSession) => void
}

function SessionRow({ session, onAsk }: SessionRowProps) {
  function handleAsk() {
    onAsk(session)
  }

  // This device signs out for real, as the account menu's Sign out does.
  function handleSignOutHere() {
    void handleSignOut()
  }

  return (
    <ListRow
      leading={<Tile tone={session.current ? 'ok' : 'neutral'}>{DEVICE_ICON[session.kind]}</Tile>}
      title={session.device}
      badge={session.current && <Badge variant="success">This device</Badge>}
      description={sessionDetail(session)}
      trailing={
        <>
          <span className="w-[130px] text-right text-2xs text-muted-foreground">
            {sessionActivity(session)}
          </span>
          {session.current ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Sign out of this device"
              onClick={handleSignOutHere}
            >
              Sign out
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={DANGER_OUTLINE}
              aria-label={`Sign out ${session.device}`}
              onClick={handleAsk}
            >
              Sign out
            </Button>
          )}
        </>
      }
    />
  )
}
