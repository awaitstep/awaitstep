import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { GraphConflictBanner } from '../graph-conflict-banner'
import { makeReviewBindings, sourceFile } from './fixtures/review-bindings'

const step = 'steps/k3j9x_a1b2c3.ts'
const other = 'steps/m4n5o_p6q7r8.ts'
const baseline = new Map([
  [step, sourceFile(step, 'return 1', 'hs2')],
  [other, sourceFile(other, 'return 3', 'ho2')],
  ['lib/a.ts', sourceFile('lib/a.ts', 'a', 'ha2')],
])

function setup(overrides: Partial<Parameters<typeof makeReviewBindings>[0]> = {}) {
  const bindings = makeReviewBindings({ baseline, ...overrides })
  render(<GraphConflictBanner bindings={bindings} />)
  return bindings
}

function refused(...paths: string[]) {
  useIdeStore.getState().setGraphConflict({ currentVersionId: 'v4', currentGraphHash: 'g4', paths })
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('GraphConflictBanner', () => {
  it('shows nothing while no step save was refused', () => {
    setup()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('with no marked draft, says to save again and offers to', async () => {
    refused(step)
    useIdeStore.getState().setDraft(step, 'return 2', 'hs2')
    const bindings = setup()
    expect(screen.getByRole('status')).toHaveTextContent(
      'The canvas changed this workflow. Save again to apply your edits on top.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save again' }))
    expect(bindings.onSaveAll).toHaveBeenCalledTimes(1)
  })

  it('with a refused draft whose node moved, asks for a review first and shows that file', async () => {
    refused(step, other)
    useIdeStore.getState().setDraft(other, 'return 4', 'ho2')
    useIdeStore.getState().setDraft(step, 'return 2', 'hs1')
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your edits are kept. Review the marked files, then save again.',
    )
    expect(screen.queryByRole('button', { name: 'Save again' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(useIdeStore.getState().activePath).toBe(step)
  })

  it('counts a refused save as marked too', () => {
    refused(step)
    useIdeStore.getState().setDraft(step, 'return 2', 'hs2')
    useIdeStore.getState().setConflict(step, { currentHash: 'hs2' })
    setup()
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument()
  })

  it('ignores drafts the refusal was not about, even when they are marked themselves', () => {
    refused(step)
    useIdeStore.getState().setDraft(step, 'return 2', 'hs2')
    useIdeStore.getState().setDraft('lib/a.ts', 'mine', 'ha1')
    useIdeStore.getState().setDraft(other, 'return 4', 'ho1')
    setup()
    expect(screen.getByRole('button', { name: 'Save again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
  })

  it('shows nothing in a view that cannot edit, and does not offer Save again while a write runs', () => {
    refused(step)
    useIdeStore.getState().setDraft(step, 'return 2', 'hs2')
    const { unmount } = render(
      <GraphConflictBanner bindings={makeReviewBindings({ baseline, canEdit: false })} />,
    )
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Save again' })).toBeDisabled()
  })

  it('says nothing was created when the refusal was about a create', async () => {
    refused()
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(
      'The canvas changed this workflow. Nothing was created. Try again.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useIdeStore.getState().graphConflict).toBeNull()
  })

  it('goes once none of the refused drafts is left, and when dismissed', async () => {
    refused(step)
    useIdeStore.getState().setDraft('lib/a.ts', 'mine', 'ha2')
    const { unmount } = render(<GraphConflictBanner bindings={makeReviewBindings({ baseline })} />)
    expect(screen.queryByRole('status')).toBeNull()
    unmount()

    useIdeStore.getState().setDraft(step, 'return 2', 'hs2')
    setup()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(useIdeStore.getState().graphConflict).toBeNull()
  })
})
