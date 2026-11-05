import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Download, Search } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorToolbar } from '../../canvas/editor-toolbar'
import { IdeHeader } from '../../ide/ide-header'
import { UnifiedTopBar, type UnifiedTopBarProps } from '../unified-top-bar'

vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ history: { back: vi.fn() } }) }))
vi.mock('../../../lib/workflows/detail-links', () => ({
  useWorkflowLinks: () => ({ overview: '/overview', deployments: '/deployments' }),
}))
const follow = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useGoTo: () => follow,
}))
vi.mock('../../canvas/time-travel', () => ({
  undoWithFeedback: vi.fn(),
  redoWithFeedback: vi.fn(),
}))

const DEPLOY_STATE = {
  hasActiveDeployment: true,
  hasUndeployedChanges: false,
  deployedVersion: 3,
  currentVersion: 3,
}

function zones(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-zone]')]
    .map((el) => el.getAttribute('data-zone')!)
    .filter((zone) => zone !== 'actions')
}

function canvasBar() {
  return render(
    <EditorToolbar
      workflowId="wf_1"
      isNew={false}
      workflowName="Orders"
      currentVersion={3}
      nodeCount={4}
      isDirty
      hasActiveDeployment
      hasUndeployedChanges={false}
      deployedVersion={3}
      onOpenSettings={vi.fn()}
      onSave={vi.fn()}
      isSaving={false}
      onDeploy={vi.fn()}
      onCheck={vi.fn()}
    />,
  )
}

function codeBar() {
  return render(
    <IdeHeader
      workflowId="wf_1"
      workflowName="Orders"
      version={3}
      deployState={DEPLOY_STATE}
      dirtyCount={1}
      canEdit
      saving={false}
      onSave={vi.fn()}
    />,
  )
}

function follows(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('the bar on both surfaces', () => {
  it('has the same zones in the same order', () => {
    const canvas = canvasBar()
    const canvasZones = zones(canvas.container)
    canvas.unmount()
    const code = codeBar()
    expect(zones(code.container)).toEqual(canvasZones)
    expect(canvasZones).toEqual(['identity', 'switch', 'toggles', 'menu', 'deploy'])
  })

  it('keeps DOM order, which is Tab order, equal to visual order', () => {
    const { container } = canvasBar()
    const at = (zone: string) => container.querySelector(`[data-zone=${zone}]`)!
    const save = screen.getByRole('button', { name: 'Save' })
    expect(follows(at('identity'), at('switch'))).toBe(true)
    expect(follows(at('switch'), at('toggles'))).toBe(true)
    expect(follows(at('toggles'), save)).toBe(true)
    expect(follows(save, at('menu'))).toBe(true)
    expect(follows(at('menu'), at('deploy'))).toBe(true)
    expect(container.querySelector('button')).toBe(screen.getByRole('button', { name: 'Back' }))
  })

  it('shows the node count and the deploy state on both', () => {
    const canvas = canvasBar()
    expect(screen.getAllByText('4 nodes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('deployed v3').length).toBeGreaterThan(0)
    canvas.unmount()
    codeBar()
    expect(screen.getAllByText('deployed v3').length).toBeGreaterThan(0)
  })

  it('gives the canvas no Preview toggle and Code no Deploy', () => {
    const canvas = canvasBar()
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeInTheDocument()
    canvas.unmount()
    const code = codeBar()
    expect(screen.getByRole('button', { name: /canvas preview/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deploy' })).toBeNull()
    // The slot stays, empty, so ⋯ does not move.
    expect(code.container.querySelector('[data-zone=deploy]')?.children).toHaveLength(0)
  })

  it('names the Save control for what it saves on each surface', () => {
    const canvas = canvasBar()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'title',
      expect.stringContaining('new version'),
    )
    canvas.unmount()
    codeBar()
    expect(screen.getByRole('button', { name: 'Save all (1)' })).toHaveAttribute(
      'title',
      expect.stringContaining('Save all files'),
    )
  })
})

function barProps(overrides: Partial<UnifiedTopBarProps> = {}): UnifiedTopBarProps {
  return {
    surface: 'canvas',
    name: 'Orders',
    version: { kind: 'current', version: 1 },
    nodeCount: 0,
    deployBadge: null,
    onSelectView: vi.fn(),
    toggles: [],
    save: { label: 'Save', saving: false, disabled: false, title: 'Save', onClick: vi.fn() },
    menu: [],
    ...overrides,
  }
}

describe('the ⋯ menu', () => {
  const onExport = vi.fn()
  const onQuick = vi.fn()
  const menu = [
    [{ id: 'export', label: 'Export', icon: Download, onSelect: onExport }],
    [{ id: 'quick', label: 'Go to file', icon: Search, onSelect: onQuick, takesFocus: true }],
  ]

  it('opens with the keyboard, walks with arrows and returns focus to ⋯ on Escape', async () => {
    render(<UnifiedTopBar {...barProps({ menu })} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(2)
    await waitFor(() => expect(items[0]).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('returns focus to ⋯ after an action that does not take focus', async () => {
    render(<UnifiedTopBar {...barProps({ menu })} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export' }))
    expect(onExport).toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('leaves focus where an action put it', async () => {
    // A dialog or panel takes focus once the menu has closed, not while it is open.
    const take = vi.fn(() => {
      setTimeout(() => document.querySelector<HTMLInputElement>('input')?.focus(), 50)
    })
    render(
      <>
        <UnifiedTopBar
          {...barProps({
            menu: [
              [
                {
                  id: 'quick',
                  label: 'Go to file',
                  icon: Search,
                  onSelect: take,
                  takesFocus: true,
                },
              ],
            ],
          })}
        />
        <input aria-label="elsewhere" />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Go to file' }))
    await waitFor(() => expect(screen.getByLabelText('elsewhere')).toHaveFocus())
  })

  it('skips empty groups and their separators', async () => {
    render(<UnifiedTopBar {...barProps({ menu: [[], menu[0]!] })} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1)
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })
})

describe('the bar toggles', () => {
  it('report their state with aria-pressed', () => {
    render(
      <UnifiedTopBar
        {...barProps({
          toggles: [
            { id: 'a', icon: Search, pressed: true, title: 'Hide A', onClick: vi.fn() },
            { id: 'b', icon: Search, pressed: false, title: 'Show B', onClick: vi.fn() },
          ],
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hide A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Show B' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('the ⋯ menu collapses with the bar, as measured when it opens', () => {
  let width = 0
  beforeEach(() => {
    follow.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  })

  const history = [
    {
      id: 'undo',
      label: 'Undo',
      icon: Download,
      onSelect: vi.fn(),
      whenCollapsed: 'history' as const,
    },
  ]
  const toggle = { id: 'a', icon: Search, pressed: true, title: 'Steps (Ctrl+B)', onClick: vi.fn() }
  const deployBadge = { label: 'deployed v2', tone: 'success' as const, href: '/deployments' }

  async function openAt(w: number, overrides: Partial<UnifiedTopBarProps> = {}) {
    width = w
    render(
      <UnifiedTopBar
        {...barProps({
          nodeCount: 4,
          deployBadge,
          toggles: [toggle],
          menu: [history],
          ...overrides,
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    return screen.findByRole('menu')
  }

  it('keeps everything on the bar, and out of ⋯, when it is wide', async () => {
    const menu = await openAt(1400)
    expect(within(menu).queryByRole('menuitem')).toBeNull()
    expect(within(menu).queryByText('4 nodes')).toBeNull()
  })

  it('lists the toggles, Undo/Redo, the node count and the deploy state when it is narrow', async () => {
    const menu = await openAt(500)
    expect(
      within(menu).getByRole('menuitem', { name: 'Steps (Ctrl+B)' }),
    ).toHaveAccessibleDescription('Showing')
    expect(within(menu).getByRole('menuitem', { name: 'Undo' })).toBeInTheDocument()
    expect(within(menu).getByText('4 nodes')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'deployed v2' })).toBeInTheDocument()
  })

  it('follows the deploy state through a real menu item, not a link the keyboard cannot reach', async () => {
    const menu = await openAt(500)
    expect(menu.querySelector('a')).toBeNull()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'deployed v2' }))
    expect(follow).toHaveBeenCalledWith('/deployments')
  })

  it('groups what it lists, so a screen reader hears where one set ends', async () => {
    const menu = await openAt(500)
    expect(within(menu).getAllByRole('group').length).toBeGreaterThanOrEqual(2)
  })

  it('moves a width at a time: Undo comes back at the history width, the node count at its own', async () => {
    const menu = await openAt(700)
    expect(within(menu).queryByRole('menuitem', { name: 'Undo' })).toBeNull()
    expect(within(menu).getByText('4 nodes')).toBeInTheDocument()
  })

  it('lists the pills of an old version at any width: its badge needs the room', async () => {
    const menu = await openAt(1600, {
      version: { kind: 'viewing', version: 2, onBackToLatest: vi.fn() },
    })
    expect(within(menu).getByText('4 nodes')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'deployed v2' })).toBeInTheDocument()
  })
})

describe('the bar does not need the window to be a given size', () => {
  it('truncates the name before it moves anything: the identity zone clips and the name shrinks', () => {
    const { container } = render(
      <UnifiedTopBar {...barProps({ name: 'A very long name '.repeat(8) })} />,
    )
    const identity = container.querySelector('[data-zone=identity]')!
    expect(identity.className).toContain('overflow-hidden')
    expect(identity.className).toContain('min-w-0')
    expect(screen.getByText(/A very long name/).className).toContain('truncate')
  })

  it('gives the actions the room they need and shares what is left, so nothing can overlap', () => {
    const { container } = render(<UnifiedTopBar {...barProps()} />)
    const grid = container.querySelector('header > div')!
    expect(grid.className).toContain('grid-cols-[minmax(2.5rem,1fr)_auto_minmax(max-content,1fr)]')
  })

  it('reserves the empty Deploy slot on Code only where there is room, and never as dead width below', () => {
    const { container } = render(<UnifiedTopBar {...barProps({ surface: 'code' })} />)
    const slot = container.querySelector('[data-zone=deploy]')!
    expect(slot.className).toMatch(/\bhidden\b/)
    expect(slot.className).toContain('@[1040px]:flex')
  })
})
