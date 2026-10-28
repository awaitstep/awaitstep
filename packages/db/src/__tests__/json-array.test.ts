import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { aliasedTable, sql } from 'drizzle-orm'
import {
  aliasedFrom,
  jsonArrayOf,
  jsonArrayOfValues,
  readJsonArray,
} from '../adapters/json-array.js'
import { projects } from '../schema/sqlite/projects.js'

const db = drizzle(new Database(':memory:'))
const render = (chunk: ReturnType<typeof sql>) =>
  db.$client &&
  (
    db as unknown as { dialect: { sqlToQuery: (s: unknown) => { sql: string } } }
  ).dialect.sqlToQuery(chunk).sql

describe('aliasedFrom', () => {
  it('names the table and its alias, where the alias alone would name nothing', () => {
    const cp = aliasedTable(projects, 'cp')
    expect(render(sql`select ${cp.id} from ${aliasedFrom(cp)}`)).toBe(
      'select "cp"."id" from "projects" "cp"',
    )
    expect(render(sql`from ${cp}`)).toBe('from "cp"')
  })
})

describe('jsonArrayOf', () => {
  const cp = aliasedTable(projects, 'cp')

  it('spells the aggregate for each dialect, with an optional order', () => {
    expect(render(jsonArrayOf('sqlite', { id: cp.id, slug: cp.slug }))).toBe(
      `json_group_array(json_object('id', "cp"."id", 'slug', "cp"."slug"))`,
    )
    expect(render(jsonArrayOf('pg', { id: cp.id }, sql`${cp.name}`))).toBe(
      `coalesce(json_agg(json_build_object('id', "cp"."id") order by "cp"."name"), '[]'::json)`,
    )
    expect(render(jsonArrayOfValues('sqlite', sql`${cp.slug}`))).toBe(
      `json_group_array("cp"."slug")`,
    )
  })
})

describe('readJsonArray', () => {
  it('parses sqlite text and passes pg values through, empty for null', () => {
    expect(readJsonArray('[{"a":1}]')).toEqual([{ a: 1 }])
    expect(readJsonArray([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(readJsonArray(null)).toEqual([])
  })
})
