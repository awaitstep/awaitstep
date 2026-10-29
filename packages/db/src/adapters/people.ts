import { toIsoTimestamp } from '../schema/pg/iso-timestamp.js'
import { readJsonArray, type Dialect } from './json-array.js'

/**
 * A people list carried as a JSON aggregate, with its `lastActiveAt` read
 * back as a UTC ISO string: inside JSON a timestamp skips the column's
 * decoder, and pg renders it without a zone.
 */
export function readPeople<T extends { lastActiveAt: string | null }>(
  value: unknown,
  dialect: Dialect,
): T[] {
  const people = readJsonArray<T>(value)
  if (dialect !== 'pg') return people
  return people.map((person) => ({
    ...person,
    lastActiveAt: person.lastActiveAt ? toIsoTimestamp(person.lastActiveAt) : null,
  }))
}
