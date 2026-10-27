import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBarContent, TopBarSlotProvider, TopBarSlotTarget } from '../top-bar-slot'

function Page() {
  const [count, setCount] = useState(0)
  function handleClick() {
    setCount((current) => current + 1)
  }
  return (
    <main>
      <TopBarContent>
        <button type="button" onClick={handleClick}>
          Clicked {count}
        </button>
      </TopBarContent>
      <p>Page body</p>
    </main>
  )
}

describe('top bar slot', () => {
  it('renders a page’s content in the frame’s top bar, with the page’s own state', async () => {
    render(
      <TopBarSlotProvider>
        <header aria-label="Top bar">
          <TopBarSlotTarget />
        </header>
        <Page />
      </TopBarSlotProvider>,
    )
    const bar = screen.getByRole('banner', { name: 'Top bar' })
    const button = within(bar).getByRole('button', { name: 'Clicked 0' })
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(within(bar).getByRole('button', { name: 'Clicked 1' })).toBeVisible()
  })

  it('renders nothing outside a frame', () => {
    render(<Page />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Page body')).toBeVisible()
  })
})
