import type { AnyRouteMatch } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgSettingsIntro } from '../../components/org-settings/org-settings-intro'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'
import { useInstanceStore } from '../../stores/instance-store'
import { EditorExtensions } from '../editor-extensions'
import {
  extensionPageHead,
  ExtensionSettingsPage,
  ExtensionWorkspacePage,
} from '../extension-pages'

// The package a wrapping workspace would install, plugged in here.
vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('./fixtures/test-extension')
  return { default: [testExtension] }
})
vi.mock('../../components/navigation/dashboard-shell', () => ({
  PageNotFound: () => <p>Page not found</p>,
}))
vi.mock('../../components/org-settings/use-org-scope', () => ({
  useOrgScope: (org: string) => ({
    org: { id: 'org_1', slug: org, name: 'Acme Inc' },
    viewerRole: 'member',
  }),
}))
// The shell resolved the workspace before the page rendered; the page reads that answer.
let lookup: unknown = null
vi.mock('../../data/dashboard/workspaces', () => ({ useScope: () => ({ data: lookup }) }))
let itemIds: unknown = null
vi.mock('../../contexts/api-client-context', () => ({ useItemApiScope: () => itemIds }))

const IDS = { organizationId: 'org_1', projectId: 'prj_1', workspaceId: 'ws_1' }
const FOUND = {
  found: true,
  org: { org: { id: 'org_1' } },
  project: { project: { id: 'prj_1' } },
  workspace: { workspace: { id: 'ws_1' }, viewerRole: 'editor' },
}

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

function inWorkspace(children: ReactNode) {
  return <EditorScopeProvider value={SALES}>{children}</EditorScopeProvider>
}

function enable(...features: string[]) {
  useInstanceStore.setState({ features })
}

beforeEach(() => {
  enable()
  lookup = FOUND
  itemIds = IDS
})

describe('editor top bar slot', () => {
  it('renders nothing while the instance does not list the extension', () => {
    const { container } = render(
      inWorkspace(<EditorExtensions slot="canvas.toolbar" workflowId="wf_1" canEdit />),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the extension’s control with the workflow and its scope once listed', () => {
    enable('test-ext')
    render(inWorkspace(<EditorExtensions slot="ide.toolbar" workflowId="wf_1" canEdit={false} />))
    const button = screen.getByRole('button', { name: 'Assist wf_1 in acme/project-101/sales' })
    expect(button).toHaveAttribute('data-can-edit', 'false')
    expect(button).toHaveAttribute('data-workspace-id', 'ws_1')
  })

  it('renders nothing until the workspace’s ids are known', () => {
    enable('test-ext')
    itemIds = null
    const { container } = render(
      inWorkspace(<EditorExtensions slot="canvas.toolbar" workflowId="wf_1" canEdit />),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing outside a workspace URL', () => {
    enable('test-ext')
    const { container } = render(
      <EditorExtensions slot="canvas.toolbar" workflowId="wf_1" canEdit />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('org settings tabs slot', () => {
  const ORG = { slug: 'acme', name: 'Acme Inc' }

  function tabs() {
    return within(screen.getByRole('navigation', { name: 'Settings sections' }))
      .getAllByRole('link')
      .map((tab) => [tab.textContent, tab.getAttribute('href')])
  }

  it('shows only the built-in tabs while the extension is not listed', () => {
    render(<OrgSettingsIntro org={ORG} section="general" />)
    expect(tabs()).toEqual([
      ['General', '/acme/settings/general'],
      ['Members', '/acme/settings/members'],
    ])
  })

  it('adds the extension’s tab after the built-in ones, marked on its page', () => {
    enable('test-ext')
    render(<OrgSettingsIntro org={ORG} section="ext:test-ext/usage" />)
    expect(tabs()).toEqual([
      ['General', '/acme/settings/general'],
      ['Members', '/acme/settings/members'],
      ['Usage', '/acme/settings/ext/test-ext/usage'],
    ])
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('extension pages', () => {
  it('render the workspace page in its scope once the extension is listed', () => {
    enable('test-ext')
    render(<ExtensionWorkspacePage slugs={SALES} splat="test-ext/history" />)
    expect(screen.getByText('History of acme/project-101/sales (ws_1, editor)')).toBeInTheDocument()
  })

  it('hand a nested page the rest of its URL', () => {
    enable('test-ext')
    render(<ExtensionWorkspacePage slugs={SALES} splat="test-ext/history/r_1" />)
    expect(
      screen.getByText('History of acme/project-101/sales (ws_1, editor) at r_1'),
    ).toBeInTheDocument()
  })

  it('render the settings page under Org Settings’ tabs', () => {
    enable('test-ext')
    render(<ExtensionSettingsPage org="acme" splat="test-ext/usage" />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Usage of acme (org_1) as member')).toBeInTheDocument()
  })

  it('are not found while the extension is not listed, whatever the path', () => {
    render(<ExtensionWorkspacePage slugs={SALES} splat="test-ext/history" />)
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByText(/History of/)).toBeNull()
  })

  it('are not found at a path the extension has no page for, or in the other scope', () => {
    enable('test-ext')
    render(
      <>
        <ExtensionWorkspacePage slugs={SALES} splat="test-ext/usage" />
        <ExtensionSettingsPage org="acme" splat="test-ext/history" />
        <ExtensionWorkspacePage slugs={SALES} splat="other/history" />
      </>,
    )
    expect(screen.getAllByText('Page not found')).toHaveLength(3)
  })
})

describe('extension page head', () => {
  function matches(features: string[]) {
    return [
      { routeId: '__root__', loaderData: undefined },
      { routeId: '/_authed', loaderData: { features } },
    ] as unknown as AnyRouteMatch[]
  }

  it('titles the page from the features the layout loaded', () => {
    expect(extensionPageHead('workspace', 'test-ext/history', matches(['test-ext']))).toEqual({
      meta: [{ title: 'Assistant history · AwaitStep' }],
    })
  })

  it('titles it not found while the extension is not listed', () => {
    expect(extensionPageHead('workspace', 'test-ext/history', matches([]))).toEqual({
      meta: [{ title: 'Page not found · AwaitStep' }],
    })
    expect(extensionPageHead('org-settings', 'test-ext/usage', [])).toEqual({
      meta: [{ title: 'Page not found · AwaitStep' }],
    })
  })
})
