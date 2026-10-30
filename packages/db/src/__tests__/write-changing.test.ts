import { describe, expect, it } from 'vitest'
import { writeChanging, type SwitchMatch } from '../adapters/projects.js'

// A switch write's two steps, scripted: what each match would find.
function scripted(answers: [SwitchMatch, { id: string }[]][]) {
  const asked: SwitchMatch[] = []
  const write = async (match: SwitchMatch) => {
    asked.push(match)
    const [expected, rows] = answers.shift()!
    expect(match).toBe(expected)
    return rows
  }
  return { write, asked }
}

describe('writeChanging', () => {
  it('reports a change when the changing write matched', async () => {
    const { write, asked } = scripted([['changing', [{ id: 'r' }]]])
    expect(await writeChanging(write)).toEqual({ id: 'r', changed: true })
    expect(asked).toEqual(['changing'])
  })

  it('reports no change when the row was already so', async () => {
    const { write } = scripted([
      ['changing', []],
      ['already', [{ id: 'r' }]],
    ])
    expect(await writeChanging(write)).toMatchObject({ changed: false })
  })

  it('runs the pair again when an opposite flip landed between the two', async () => {
    const { write, asked } = scripted([
      ['changing', []],
      ['already', []],
      ['changing', [{ id: 'r' }]],
    ])
    expect(await writeChanging(write)).toMatchObject({ changed: true })
    expect(asked).toEqual(['changing', 'already', 'changing'])
  })

  it('answers null when the row is gone or refused', async () => {
    const { write } = scripted([
      ['changing', []],
      ['already', []],
      ['changing', []],
      ['already', []],
    ])
    expect(await writeChanging(write)).toBeNull()
  })
})
