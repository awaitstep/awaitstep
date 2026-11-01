import { describe, expect, it } from 'vitest'
import type { SharedItem } from '../../../types/dashboard/items'
import type { Connection } from '../../../types/dashboard/org-settings'
import type { Person } from '../../../types/dashboard/session'
import {
  deploysSentence,
  peopleSentence,
  reuseSentence,
  sharedSentence,
} from '../workspace-start-copy'

function person(id: string, name: string, email = `${id}@acme.test`): Person {
  return { id, name, email, initials: name.slice(0, 2), image: null }
}

const me = person('me', 'Frank Owusu')
const ama = person('ama', 'Ama Mensah')
const tom = person('tom', 'Tom Becker')
const dan = person('dan', 'Daniel Kim')
const priya = person('priya', 'Priya Shah')

describe('peopleSentence', () => {
  it('names the viewer first, as you', () => {
    expect(peopleSentence([ama, me], 'me', 'Default')).toBe(
      '2 can open Default — you and Ama Mensah',
    )
  })

  it('names up to four people, then says how many more', () => {
    expect(peopleSentence([me, ama, tom, dan], 'me', 'Sales')).toBe(
      '4 can open Sales — you, Ama Mensah, Tom Becker and Daniel Kim',
    )
    expect(peopleSentence([me, ama, tom, dan, priya], 'me', 'Sales')).toBe(
      '5 can open Sales — you, Ama Mensah, Tom Becker and 2 more',
    )
  })

  it('falls back to the email for someone without a name', () => {
    expect(peopleSentence([person('x', '', 'x@acme.test')], 'me', 'Ops')).toBe(
      '1 can open Ops — x@acme.test',
    )
  })
})

describe('deploysSentence', () => {
  const conn = (name: string) => ({ name }) as Connection

  it('names the account and where it comes from', () => {
    expect(deploysSentence([conn('Acme production')], 'Project 101')).toBe(
      'Acme production, inherited from Project 101',
    )
    expect(deploysSentence([conn('Acme production'), conn('Staging')], 'Project 101')).toBe(
      'Acme production and 1 more, inherited from Project 101',
    )
  })

  it('is null when no account deploys the project', () => {
    expect(deploysSentence([], 'Project 101')).toBeNull()
  })
})

describe('sharedSentence', () => {
  it('says nothing is shared, else the counts each way', () => {
    expect(sharedSentence(0, 0)).toBe('Nothing shared in or out of this workspace yet')
    expect(sharedSentence(3, 1)).toBe('3 shared in · 1 shared out')
  })
})

describe('reuseSentence', () => {
  const item = (kind: SharedItem['kind']) => ({ kind }) as SharedItem

  it('counts workflows as workflows, and a mix as items', () => {
    expect(reuseSentence([item('workflow'), item('workflow')], 'Project 101')).toBe(
      'Project 101 already shares 2 workflows with this workspace. Call them instead of rebuilding.',
    )
    expect(reuseSentence([item('workflow'), item('script')], 'Project 101')).toMatch(
      /^Project 101 already shares 2 items/,
    )
  })

  it('points at the library when nothing is shared yet', () => {
    expect(reuseSentence([], 'Project 101')).toMatch(/^Nothing is shared with this workspace yet/)
  })
})
