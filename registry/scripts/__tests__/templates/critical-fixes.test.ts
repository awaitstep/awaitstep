import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import mailchimp from '../../../nodes/mailchimp/1.1.0/template.js'
import convertkit from '../../../nodes/convertkit/2.0.0/template.js'
import notion from '../../../nodes/notion/2.0.0/template.js'
import teams from '../../../nodes/microsoft-teams/1.1.0/template.js'
import upstash from '../../../nodes/upstash-redis/1.1.0/template.js'
import firestore from '../../../nodes/firebase-firestore/1.1.0/template.js'
import discord from '../../../nodes/discord/1.1.0/template.js'
import linear from '../../../nodes/linear/1.1.0/template.js'

type Context = { config: Record<string, unknown>; env: Record<string, string> }
type Handler = (ctx: Context) => Promise<Record<string, unknown>>

function respond(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(respond(body, status))
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function ctx(config: Record<string, unknown>, env: Record<string, string>): Context {
  return { config, env }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Mailchimp subscriber hashing', () => {
  it('uses MD5, which Web Crypto does not support', async () => {
    const fetchMock = mockFetch({ id: 'member-1', status: 'subscribed' })
    const handler = mailchimp as unknown as Handler
    await handler(
      ctx(
        {
          action: 'Update Subscriber',
          listId: 'list-1',
          email: 'Test@Example.com',
          status: 'subscribed',
        },
        { MAILCHIMP_API_KEY: 'key-us1' },
      ),
    )

    const url = String(fetchMock.mock.calls[0][0])
    const expected = createHash('md5').update('test@example.com').digest('hex')
    expect(url).toContain(`/lists/list-1/members/${expected}`)
  })
})

describe('Kit v4 migration', () => {
  it('uses the v4 endpoint, API-key header, and email_address body', async () => {
    const fetchMock = mockFetch({ subscriber: { id: 123 } })
    const handler = convertkit as unknown as Handler
    const result = await handler(
      ctx(
        { action: 'Add Subscriber', email: 'person@example.com', firstName: 'Ada' },
        { KIT_API_KEY: 'kit-key' },
      ),
    )

    expect(result.id).toBe('123')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.kit.com/v4/subscribers')
    expect((init as RequestInit).headers).toMatchObject({ 'X-Kit-Api-Key': 'kit-key' })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      email_address: 'person@example.com',
      first_name: 'Ada',
    })
  })

  it('sends status=all rather than dropping the filter', async () => {
    const fetchMock = mockFetch({ subscribers: [] })
    const handler = convertkit as unknown as Handler
    await handler(
      ctx(
        { action: 'List Subscribers', statusFilter: 'all', limit: 25 },
        { KIT_API_KEY: 'kit-key' },
      ),
    )

    expect(String(fetchMock.mock.calls[0][0])).toContain('status=all')
  })
})

describe('Notion 2026-03-11 migration', () => {
  it('queries a data source with the current version header', async () => {
    const fetchMock = mockFetch({ results: [] })
    const handler = notion as unknown as Handler
    await handler(
      ctx(
        { action: 'Query Data Source', dataSourceId: 'ds-1', pageSize: 25 },
        { NOTION_API_KEY: 'notion-key' },
      ),
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.notion.com/v1/data_sources/ds-1/query')
    expect((init as RequestInit).headers).toMatchObject({ 'Notion-Version': '2026-03-11' })
  })

  it('creates a page under a data source', async () => {
    const fetchMock = mockFetch({ id: 'page-1', url: 'https://notion.so/page-1' })
    const handler = notion as unknown as Handler
    await handler(
      ctx(
        { action: 'Create Page', dataSourceId: 'ds-1', properties: '{}' },
        { NOTION_API_KEY: 'notion-key' },
      ),
    )

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-1' })
  })
})

describe('Microsoft Teams Workflows webhook', () => {
  it('sends an Adaptive Card instead of the retired connector text payload', async () => {
    const fetchMock = mockFetch({}, 202)
    const handler = teams as unknown as Handler
    await handler(
      ctx(
        { action: 'Send Webhook Message', text: 'Deploy finished' },
        { TEAMS_WEBHOOK_URL: 'https://example.com/workflow' },
      ),
    )

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body)) as {
      attachments: Array<{ contentType: string; content: { body: Array<{ text: string }> } }>
    }
    expect(body.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(body.attachments[0].content.body[0].text).toBe('Deploy finished')
  })
})

describe('Upstash result serialization', () => {
  it('serializes arrays with JSON instead of String()', async () => {
    mockFetch({ result: ['a', 'b'] })
    const handler = upstash as unknown as Handler
    const result = await handler(
      ctx(
        { action: 'LRANGE', key: 'list', start: 0, stop: -1 },
        {
          UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
          UPSTASH_REDIS_REST_TOKEN: 'token',
        },
      ),
    )

    expect(result.result).toBe('["a","b"]')
    expect(result.data).toEqual({ result: ['a', 'b'] })
  })
})

describe('Firestore query value typing', () => {
  it('keeps a numeric-looking string as a string when the type is string', async () => {
    const fetchMock = mockFetch([])
    const handler = firestore as unknown as Handler
    const result = await handler(
      ctx(
        {
          action: 'Query Collection',
          projectId: 'project',
          collection: 'users',
          queryField: 'age',
          queryValue: '123',
          queryValueType: 'string',
          limit: 10,
        },
        { FIREBASE_ACCESS_TOKEN: 'token' },
      ),
    )

    expect(result.data).toEqual({ items: [] })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body)) as {
      structuredQuery: { where: { fieldFilter: { value: unknown } } }
    }
    expect(body.structuredQuery.where.fieldFilter.value).toEqual({ stringValue: '123' })
  })

  it('converts when the type is number', async () => {
    const fetchMock = mockFetch([])
    const handler = firestore as unknown as Handler
    await handler(
      ctx(
        {
          action: 'Query Collection',
          projectId: 'project',
          collection: 'users',
          queryField: 'age',
          queryValue: '123',
          queryValueType: 'number',
          limit: 10,
        },
        { FIREBASE_ACCESS_TOKEN: 'token' },
      ),
    )

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body)) as {
      structuredQuery: { where: { fieldFilter: { value: unknown } } }
    }
    expect(body.structuredQuery.where.fieldFilter.value).toEqual({ integerValue: '123' })
  })
})

describe('Linear personal API keys', () => {
  it('sends the raw key, not a Bearer token', async () => {
    const fetchMock = mockFetch({ data: { teams: { nodes: [] } } })
    const handler = linear as unknown as Handler
    await handler(ctx({ action: 'List Teams' }, { LINEAR_API_KEY: 'lin_api_personal' }))

    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'lin_api_personal',
    })
  })
})

describe('Discord empty responses', () => {
  it('does not parse a 204 reaction response as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body')
      },
      text: async () => '',
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch
    const handler = discord as unknown as Handler
    const result = await handler(
      ctx(
        { action: 'Add Reaction', channelId: 'c1', messageId: 'm1', emoji: '👍' },
        { DISCORD_BOT_TOKEN: 'bot-token' },
      ),
    )

    expect(result.data).toEqual({})
  })
})
