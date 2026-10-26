const MINUTE = 60_000

/** An ISO time `minutes` before `now`, so "5m ago" stays 5 m ago whenever the seed runs. */
export function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * MINUTE).toISOString()
}

export function daysAgo(now: Date, days: number): string {
  return minutesAgo(now, days * 24 * 60)
}
