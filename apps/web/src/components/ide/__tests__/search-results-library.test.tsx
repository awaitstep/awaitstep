import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchResultsList } from '../search-results-list'

const hit = { line: 1, column: 1, endColumn: 6, text: 'score()', matchStart: 0, matchEnd: 5 }

describe('SearchResultsList with Library files', () => {
  it('lists them in their own read-only group between yours and generated', () => {
    render(
      <SearchResultsList
        results={{
          files: [
            { path: 'lib/a.ts', generated: false, hits: [hit] },
            { path: 'modules/lead-scoring/index.ts', generated: true, library: true, hits: [hit] },
            { path: 'worker.ts', generated: true, hits: [hit] },
          ],
          total: 3,
          capped: false,
        }}
        currentKey={null}
        onOpenHit={vi.fn()}
        onFocusInput={vi.fn()}
        onEscape={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Your files',
      'Script and node files, read-only',
      'Generated files, read-only',
    ])
    expect(screen.getByText('Scripts & nodes · read-only · 1')).toBeInTheDocument()
  })
})
