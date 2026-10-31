import type { SessionRow, SignInMethodRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { AMA, PEOPLE } from './people'

// The AccountSessions board's sign-in methods and sessions for Ama. Everyone
// else is signed in on one device with the email link only.

export function seedSignInMethods(now: Date): SignInMethodRow[] {
  return [{ userId: AMA, provider: 'github', connectedAt: daysAgo(now, 56) }]
}

export function seedSessions(now: Date): SessionRow[] {
  const ama: SessionRow[] = [
    {
      id: 'ses_ama_chrome',
      userId: AMA,
      device: 'Chrome on macOS',
      kind: 'desktop',
      ip: '81.2.69.x',
      signedInAt: daysAgo(now, 3),
      activeAt: minutesAgo(now, 0),
      current: true,
    },
    {
      id: 'ses_ama_firefox',
      userId: AMA,
      device: 'Firefox on Windows',
      kind: 'desktop',
      ip: '81.2.69.x',
      signedInAt: daysAgo(now, 5),
      activeAt: minutesAgo(now, 120),
      current: false,
    },
    {
      id: 'ses_ama_iphone',
      userId: AMA,
      device: 'Safari on iPhone',
      kind: 'phone',
      ip: '203.0.113.x',
      signedInAt: minutesAgo(now, 30 * 60),
      activeAt: minutesAgo(now, 26 * 60),
      current: false,
    },
    {
      id: 'ses_ama_unknown',
      userId: AMA,
      device: 'Unknown browser',
      kind: 'terminal',
      ip: '198.51.100.x',
      signedInAt: daysAgo(now, 6),
      activeAt: daysAgo(now, 6),
      current: false,
    },
  ]
  const others = PEOPLE.filter((p) => p.id !== AMA).map((p): SessionRow => ({
    id: `ses_${p.id.replace(/^usr_/, '')}_chrome`,
    userId: p.id,
    device: 'Chrome on macOS',
    kind: 'desktop',
    ip: '192.0.2.x',
    signedInAt: daysAgo(now, 2),
    activeAt: minutesAgo(now, 0),
    current: true,
  }))
  return [...ama, ...others]
}
