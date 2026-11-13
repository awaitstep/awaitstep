import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { libraryIconUrl, marketplaceIconUrl } from '../../../../lib/library/icon-urls'
import { LibraryKindTile } from '../library-kind-tile'

describe('LibraryKindTile', () => {
  it('shows the node’s own logo, and its kind’s glyph when the logo fails to load', () => {
    const { container } = render(<LibraryKindTile kind="node" iconSrc="/api/x/icon?v=h" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/api/x/icon?v=h')
    // A marketplace logo's host must not learn the dashboard path it was shown on.
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<>')
  })

  it('shows the glyph without a logo', () => {
    const { container } = render(<LibraryKindTile kind="module" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('{}')
  })
})

describe('icon URLs', () => {
  it('addresses a node’s icon by id, with its hash for the cache', () => {
    expect(libraryIconUrl('a b', 'h1')).toBe('/api/library/items/a%20b/icon?v=h1')
  })

  it('draws a marketplace logo only from an https address', () => {
    expect(marketplaceIconUrl('https://x.test/i.svg')).toBe('https://x.test/i.svg')
    expect(marketplaceIconUrl('javascript:alert(1)')).toBeUndefined()
    expect(marketplaceIconUrl('http://x.test/i.svg')).toBeUndefined()
    expect(marketplaceIconUrl(null)).toBeUndefined()
  })
})
