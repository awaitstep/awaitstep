import { describe, expect, it } from 'vitest'
import { readInstanceFeatures } from '../instance-features'

function answering(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status })
}

describe('readInstanceFeatures', () => {
  it('returns the ids the instance lists', async () => {
    expect(await readInstanceFeatures(answering(200, { features: ['a', 'b-2'] }))).toEqual([
      'a',
      'b-2',
    ])
  })

  it('treats an error answer, a failed request or a malformed body as no features', async () => {
    expect(await readInstanceFeatures(answering(500, { features: ['a'] }))).toEqual([])
    expect(await readInstanceFeatures(answering(404, { error: 'Not found' }))).toEqual([])
    expect(await readInstanceFeatures(answering(200, { features: 'a' }))).toEqual([])
    expect(await readInstanceFeatures(answering(200, null))).toEqual([])
    expect(
      await readInstanceFeatures(async () => {
        throw new TypeError('fetch failed')
      }),
    ).toEqual([])
    expect(await readInstanceFeatures(async () => new Response('<html>', { status: 200 }))).toEqual(
      [],
    )
  })

  it('drops entries that are not extension ids', async () => {
    const body = { features: ['ok', 7, '../x', 'Upper', '', 'fine-too'] }
    expect(await readInstanceFeatures(answering(200, body))).toEqual(['ok', 'fine-too'])
  })
})
