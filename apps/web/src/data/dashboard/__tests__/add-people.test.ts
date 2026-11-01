import { describe, expect, it } from 'vitest'
import { addEach, addPeopleSummary } from '../add-people'

describe('addPeopleSummary', () => {
  it('toasts the counts, and how many didn’t go through', () => {
    expect(addPeopleSummary([{ key: 'a', result: 'added' }])).toBe('Added 1 person')
    expect(
      addPeopleSummary([
        { key: 'a', result: 'added' },
        { key: 'b', result: 'added' },
        { key: 'x', result: 'invited' },
        { key: 'c', result: 'failed', error: 'no' },
      ]),
    ).toBe('Added 2 people and sent 1 invite · 1 not added')
    expect(addPeopleSummary([{ key: 'x', result: 'invited' }])).toBe('Invite sent')
  })
})

function refused(message: string, status = 409) {
  return Object.assign(new Error(message), { status })
}

describe('addEach', () => {
  it('reports each pick: added with what was granted, refused with its reason, invited', async () => {
    const outcomes = await addEach(
      { userIds: ['eve', 'dan', 'sam'], emails: ['x@new.test', 'y@new.test'] },
      async (userId) => {
        if (userId === 'dan') throw refused('They already have editor access through the project')
        return userId === 'eve' ? ['IT'] : undefined
      },
      async () => undefined,
    )
    expect(outcomes).toEqual([
      { key: 'eve', result: 'added', workspaces: ['IT'] },
      {
        key: 'dan',
        result: 'failed',
        error: 'They already have editor access through the project',
      },
      { key: 'sam', result: 'added' },
      { key: 'x@new.test', result: 'invited' },
      { key: 'y@new.test', result: 'invited' },
    ])
  })

  it('marks every address failed with the invite’s reason when the invite request is refused', async () => {
    const outcomes = await addEach(
      { userIds: ['sam'], emails: ['dan@acme.test'] },
      async () => undefined,
      async () => {
        throw refused('dan@acme.test is already in the organization')
      },
    )
    expect(outcomes[1]).toEqual({
      key: 'dan@acme.test',
      result: 'failed',
      error: 'dan@acme.test is already in the organization',
    })
  })

  it('keeps the general line for a server error, not its message', async () => {
    const outcomes = await addEach(
      { userIds: ['sam', 'eve'], emails: [] },
      async (userId) => {
        if (userId === 'eve') throw refused('stack trace here', 500)
      },
      async () => undefined,
    )
    expect(outcomes[1]).toEqual({ key: 'eve', result: 'failed', error: 'Couldn’t add them' })
  })

  it('fails the action with the first refusal when nothing went through', async () => {
    await expect(
      addEach(
        { userIds: ['dan'], emails: [] },
        async () => {
          throw refused('Already in this project')
        },
        async () => undefined,
      ),
    ).rejects.toThrow('Already in this project')
  })

  it('never calls the invite endpoint without addresses', async () => {
    let invited = false
    await addEach(
      { userIds: ['sam'], emails: [] },
      async () => undefined,
      async () => {
        invited = true
      },
    )
    expect(invited).toBe(false)
  })
})
