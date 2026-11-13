import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDashboardData } from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { VersionHistoryDialog } from '../version-history-dialog'

const api = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  getUsages: vi.fn(),
  restore: vi.fn(),
}))
vi.mock('../../../lib/library-api', () => ({ libraryApi: api }))

const place = { org: 'acme', project: 'project-101', workspace: 'sales' }
const item = { id: 'lead', kind: 'module' as const, name: 'Lead scoring' }
const by = { id: 'u-ama', name: 'Ama Mensah' }

function versions() {
  api.listVersions.mockResolvedValue({
    versions: [
      { version: '1.4.2', seq: 3, publishedAt: '2026-11-10T00:00:00.000Z', publishedBy: by },
      { version: '1.4.1', seq: 2, publishedAt: '2026-11-05T00:00:00.000Z', publishedBy: by },
      { version: '1.3.0', seq: 1, publishedAt: '2026-10-21T00:00:00.000Z', publishedBy: null },
    ],
  })
  api.getVersion.mockImplementation((_id: string, version: string) =>
    Promise.resolve({
      version,
      files: [
        { path: 'index.ts', source: version === '1.4.2' ? 'a\nB\nc\n' : 'a\nb\nc\n' },
        { path: 'package.json', source: '{}\n' },
      ],
      imports: [],
    }),
  )
  api.getUsages.mockResolvedValue({
    uses: [],
    usedBy: {
      visible: [
        { kind: 'workflow', id: 'w1', name: 'Lead routing', workspace: {}, runs: '1.4.1' },
        { kind: 'workflow', id: 'w2', name: 'Nurture', workspace: {}, runs: '1.4.2' },
      ],
      hiddenCount: 0,
    },
  })
}

afterEach(() => vi.clearAllMocks())

describe('VersionHistoryDialog', () => {
  it('compares the previous version with the current, per file, and says who still runs it', async () => {
    versions()
    renderWithDashboardData(
      <VersionHistoryDialog place={place} item={item} onClose={vi.fn()} canEdit />,
    )
    const list = await screen.findByRole('list', { name: 'Versions' })
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    expect(within(list).getByRole('button', { name: /1\.4\.2/ })).toHaveTextContent('current')
    expect(within(list).getByRole('button', { name: /1\.4\.1/ })).toHaveTextContent('in use')
    expect(within(list).getByRole('button', { name: /1\.4\.1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const diff = await screen.findByRole('region', { name: 'index.ts' })
    expect(diff).toHaveTextContent('+1')
    expect(diff).toHaveTextContent('−1')
    expect(screen.queryByRole('region', { name: 'package.json' })).not.toBeInTheDocument()
    expect(screen.getByText('1 workflow still runs v1.4.1')).toBeVisible()
  })

  it('lays out as 28i: name and count in the header, focus on the selected version, a compare bar and the selection in the footer', async () => {
    versions()
    renderWithDashboardData(
      <VersionHistoryDialog place={place} item={item} onClose={vi.fn()} canEdit />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Lead scoring · version history' })
    expect(await within(dialog).findByText('3 versions')).toBeVisible()
    const versionList = await within(dialog).findByRole('list', { name: 'Versions' })
    const selected = within(versionList).getByRole('button', { name: /1\.4\.1/ })
    await waitFor(() => expect(selected).toHaveFocus())
    expect(within(dialog).getByRole('button', { name: 'Close' })).not.toHaveFocus()
    expect(await within(dialog).findByText('v1.4.1 → v1.4.2 (current)')).toBeVisible()
    expect(within(dialog).getByText(/^Selected v1\.4\.1 · published by Ama Mensah/)).toBeVisible()
  })

  it('restores the selected version only after confirming', async () => {
    versions()
    api.restore.mockResolvedValue({ restoredFrom: '1.3.0', version: '1.4.3' })
    const onRestored = vi.fn()
    renderWithDashboardData(
      <VersionHistoryDialog
        place={place}
        item={item}
        onClose={vi.fn()}
        canEdit
        onRestored={onRestored}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /1\.3\.0/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Restore v1.3.0' }))
    expect(api.restore).not.toHaveBeenCalled()
    const confirm = await screen.findByRole('alertdialog', { name: 'Restore v1.3.0?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Restore' }))
    expect(api.restore).toHaveBeenCalledWith('lead', '1.3.0')
    expect(onRestored).toHaveBeenCalledWith('1.4.3')
  })

  it('offers no Restore to someone who can’t edit', async () => {
    versions()
    renderWithDashboardData(
      <VersionHistoryDialog place={place} item={item} onClose={vi.fn()} canEdit={false} />,
    )
    await screen.findByRole('list', { name: 'Versions' })
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument()
  })

  it('shows a never-published item what publishing gives it, and publishes from there in the IDE', async () => {
    api.listVersions.mockResolvedValue({ versions: [] })
    api.getUsages.mockResolvedValue({ uses: [], usedBy: { visible: [], hiddenCount: 0 } })
    const onClose = vi.fn()
    const onPublish = vi.fn()
    renderWithDashboardData(
      <VersionHistoryDialog
        place={place}
        item={item}
        onClose={onClose}
        canEdit
        savedAt={new Date().toISOString()}
        placeName="Sales"
        publish={{ label: 'Publish v1.0.0', disabledReason: null, onPublish }}
      />,
    )
    expect(await screen.findByText('Nothing published yet')).toBeVisible()
    expect(screen.getByText('No versions')).toBeVisible()
    expect(screen.getByText(/^Draft · saved/)).toBeVisible()
    expect(screen.getByText('Drafts stay in Sales.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Publish v1.0.0' }))
    expect(onClose).toHaveBeenCalled()
    expect(onPublish).toHaveBeenCalled()
  })

  it('offers only Close for a never-published item on the Library page', async () => {
    api.listVersions.mockResolvedValue({ versions: [] })
    api.getUsages.mockResolvedValue({ uses: [], usedBy: { visible: [], hiddenCount: 0 } })
    renderWithDashboardData(
      <VersionHistoryDialog place={place} item={item} onClose={vi.fn()} canEdit />,
    )
    expect(await screen.findByText('Nothing published yet')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })
})
