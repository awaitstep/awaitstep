import type { PersonId } from '../../fixtures/api'

/**
 * The viewer's own fixture. A missing one is the test's mistake, not an API
 * answer: it throws, and the fake fails the test with this message.
 */
export function viewerFixture<T>(
  byViewer: Partial<Record<PersonId, T>>,
  viewer: PersonId,
  what: string,
): T {
  const found = byViewer[viewer]
  if (found === undefined) {
    throw new Error(`Fake API: no ${what} fixture for ${viewer}; add one or override the route`)
  }
  return found
}
