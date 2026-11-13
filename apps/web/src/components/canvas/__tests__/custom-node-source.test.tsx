import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { CustomNodeSourceLine, CustomNodeUnavailable } from '../custom-node-source'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

describe('CustomNodeSourceLine', () => {
  it('names the version and links to the item in its owner’s Library IDE', () => {
    render(
      <EditorScopeProvider value={SALES}>
        <CustomNodeSourceLine source={{ itemId: 'crm', owner: 'project', version: '1.2.0' }} />
      </EditorScopeProvider>,
    )
    expect(screen.getByText('Custom node')).toBeInTheDocument()
    expect(screen.getByText('v1.2.0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Scripts & nodes' })).toHaveAttribute(
      'href',
      '/acme/project-101/scripts-nodes/code?item=crm',
    )
  })

  it('has no link outside a workspace URL', () => {
    render(
      <CustomNodeSourceLine source={{ itemId: 'lead', owner: 'workspace', version: '1.0.1' }} />,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('CustomNodeUnavailable', () => {
  it('says why without naming the item', () => {
    render(<CustomNodeUnavailable />)
    expect(
      screen.getByText('This custom node isn’t published, or isn’t in this workspace.'),
    ).toBeInTheDocument()
  })
})
