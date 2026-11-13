import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { LibraryFileBanner } from '../library-file-banner'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }
const MODULE = {
  itemId: 'i1',
  slug: 'lead-scoring',

  owner: 'workspace' as const,
  version: '1.4.2',
}

describe('LibraryFileBanner', () => {
  it('names the version, says deploys take the latest, and opens the file in the Library', () => {
    render(
      <EditorScopeProvider value={SALES}>
        <LibraryFileBanner path="modules/lead-scoring/score.ts" module={MODULE} />
      </EditorScopeProvider>,
    )
    expect(
      screen.getByText(
        'lead-scoring 1.4.2 from Scripts & nodes. Workflows get the latest published version on deploy.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Scripts & nodes' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/scripts-nodes/code?item=i1&file=score.ts',
    )
  })
})
