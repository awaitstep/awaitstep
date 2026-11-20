import { describe, expect, it } from 'vitest'
import { readInstance } from '../instance-features'

function answering(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status })
}

const NOTHING = { features: [], disabled: [] }

describe('readInstance', () => {
  it('returns the extension ids and switched-off features the instance lists', async () => {
    const body = { features: ['a', 'b-2'], disabled: ['playground', 'connections.ui'] }
    expect(await readInstance(answering(200, body))).toEqual({
      features: ['a', 'b-2'],
      disabled: ['playground', 'connections.ui'],
    })
  })

  it('treats an error answer, a failed request or a malformed body as nothing', async () => {
    expect(await readInstance(answering(500, { features: ['a'] }))).toEqual(NOTHING)
    expect(await readInstance(answering(404, { error: 'Not found' }))).toEqual(NOTHING)
    expect(await readInstance(answering(200, { features: 'a', disabled: 'playground' }))).toEqual(
      NOTHING,
    )
    expect(await readInstance(answering(200, null))).toEqual(NOTHING)
    expect(
      await readInstance(async () => {
        throw new TypeError('fetch failed')
      }),
    ).toEqual(NOTHING)
    expect(await readInstance(async () => new Response('<html>', { status: 200 }))).toEqual(NOTHING)
  })

  it('reads an older API without `disabled` as nothing switched off', async () => {
    expect(await readInstance(answering(200, { features: ['a'] }))).toEqual({
      features: ['a'],
      disabled: [],
    })
  })

  it('drops entries that are not extension ids or known switches', async () => {
    const body = {
      features: ['ok', 7, '../x', 'Upper', '', 'fine-too'],
      disabled: ['playground', 'help', 3, 'connections.apiTokens'],
    }
    expect(await readInstance(answering(200, body))).toEqual({
      features: ['ok', 'fine-too'],
      disabled: ['playground', 'connections.apiTokens'],
    })
  })
})
