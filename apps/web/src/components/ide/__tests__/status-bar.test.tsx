import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { StatusBar } from '../status-bar'

function renderBar(overrides: Partial<React.ComponentProps<typeof StatusBar>> = {}) {
  const props: React.ComponentProps<typeof StatusBar> = {
    version: 12,
    historical: false,
    session: { tone: 'ok', label: 'Test session · running' },
    errors: 1,
    warnings: 2,
    unsaved: ['lib/payments/charge.ts', 'lib/errors.ts'],
    canEdit: true,
    activePath: 'lib/payments/charge.ts',
    readOnly: false,
    onOpenLatest: vi.fn(),
    onShowSession: vi.fn(),
    onShowProblems: vi.fn(),
    onOpenFile: vi.fn(),
    onSaveAll: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  }
  render(<StatusBar {...props} />)
  return props
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('StatusBar', () => {
  it('shows version, session, problems, position and language', () => {
    useIdeStore.getState().setCursor({ line: 8, column: 14 })
    renderBar()
    expect(screen.getByText('v12')).toBeInTheDocument()
    expect(screen.getByText('Test session · running')).toBeInTheDocument()
    expect(screen.getByText('⊗ 1')).toBeInTheDocument()
    expect(screen.getByText('⚠ 2')).toBeInTheDocument()
    expect(screen.getByText('Ln 8, Col 14')).toBeInTheDocument()
    expect(screen.getByText('Spaces: 2')).toBeInTheDocument()
  })

  it('opens the session and problems tabs from their items', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByRole('button', { name: /Test session/ }))
    await userEvent.click(screen.getByRole('button', { name: /⊗ 1/ }))
    expect(props.onShowSession).toHaveBeenCalled()
    expect(props.onShowProblems).toHaveBeenCalled()
  })

  it('offers the way back to the latest version when viewing an older one', async () => {
    const props = renderBar({ version: 10, historical: true })
    await userEvent.click(screen.getByRole('button', { name: 'Viewing v10' }))
    expect(props.onOpenLatest).toHaveBeenCalled()
  })

  it('lists unsaved files from the count and opens the one you pick', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByRole('button', { name: '2 unsaved ›' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /errors\.ts/ }))
    expect(props.onOpenFile).toHaveBeenCalledWith('lib/errors.ts')
  })

  it('shows no unsaved item when nothing is unsaved', () => {
    renderBar({ unsaved: [] })
    expect(screen.queryByText(/unsaved/)).toBeNull()
  })

  it('hides the position and language when no file is open', () => {
    renderBar({ activePath: null })
    expect(screen.queryByText(/Ln /)).toBeNull()
  })

  it('opens Go to line from the position', async () => {
    const trigger = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus: vi.fn(), trigger, searchSeed: () => null })
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /Ln 1, Col 1/ }))
    expect(trigger).toHaveBeenCalledWith('editor.action.gotoLine')
  })
})

describe('StatusBar announcements', () => {
  it('is not a live region, so typing does not re-announce the whole bar', () => {
    renderBar()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
