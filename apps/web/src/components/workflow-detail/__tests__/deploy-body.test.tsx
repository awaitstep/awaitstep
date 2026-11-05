import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { parseDeploySearch } from '../../../lib/workflows/deploy-search'
import type * as ApiClient from '../../../lib/api-client'
import { ApiError } from '../../../lib/api-client'
import { DeployBody } from '../deploy-body'
import { BASE, VIEWER, renderWithPages } from './fixtures/workspace-pages'

const calls = vi.hoisted(() => ({ getVersion: vi.fn() }))

vi.mock('../../../lib/api-client', async (actual) => ({
  ...(await actual<typeof ApiClient>()),
  api: { getVersion: calls.getVersion },
}))
vi.mock('../../deploy/deploy-page', () => ({
  DeployPage: ({ versionId }: { versionId?: string }) => (
    <p>deploy form for {versionId ?? 'current'}</p>
  ),
}))
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const WORKFLOW = { id: 'wf_1', name: 'Lead enrichment', createdAt: '', updatedAt: '' }

beforeEach(() => vi.clearAllMocks())

describe('DeployBody', () => {
  it('names the version a link asks for, however far back it is, and hands it to the form', async () => {
    calls.getVersion.mockResolvedValue({ id: 'v-old', version: 4 })
    renderWithPages(<DeployBody workflow={WORKFLOW} versionId="v-old" />, {})
    expect(await screen.findByText('Deploys v4, not the latest.')).toBeVisible()
    expect(screen.getByText('deploy form for v-old')).toBeVisible()
    expect(calls.getVersion).toHaveBeenCalledWith('wf_1', 'v-old')
  })

  it('says a version that isn’t this workflow’s isn’t, and shows no form', async () => {
    calls.getVersion.mockRejectedValue(new ApiError('Not found', 404))
    renderWithPages(<DeployBody workflow={WORKFLOW} versionId="v-other" />, {})
    expect(await screen.findByRole('link', { name: 'Deploy the latest instead' })).toHaveAttribute(
      'href',
      `${BASE}/deploy`,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That version isn’t one of this workflow’s.',
    )
    expect(screen.queryByText(/deploy form/)).not.toBeInTheDocument()
  })

  it('tells a Viewer they can’t deploy, instead of showing the form', () => {
    renderWithPages(<DeployBody workflow={WORKFLOW} versionId="v-old" />, {}, VIEWER)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Building, deploying and sharing need an Editor',
    )
    expect(screen.queryByText(/deploy form/)).not.toBeInTheDocument()
    expect(calls.getVersion).not.toHaveBeenCalled()
  })

  it('deploys the current version without asking which, when the link names none', () => {
    renderWithPages(<DeployBody workflow={WORKFLOW} versionId={undefined} />, {})
    expect(screen.getByText('deploy form for current')).toBeVisible()
    expect(calls.getVersion).not.toHaveBeenCalled()
  })
})

describe('parseDeploySearch', () => {
  it('keeps a version id, and drops anything else', () => {
    expect(parseDeploySearch({ version: 'v1' })).toEqual({ version: 'v1' })
    expect(parseDeploySearch({ version: '' })).toEqual({ version: undefined })
    expect(parseDeploySearch({ version: 3 })).toEqual({ version: undefined })
    expect(parseDeploySearch({})).toEqual({ version: undefined })
  })
})
