import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { PersonAvatar } from '../avatar-stack'

const AMA = { id: 'usr_ama', name: 'Ama Mensah', initials: 'AM' }

describe('PersonAvatar', () => {
  it('shows the initials without a photo', () => {
    const { container } = render(<PersonAvatar person={{ ...AMA, image: null }} />)
    expect(container).toHaveTextContent('AM')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows an uploaded photo instead of the initials', () => {
    const image = 'data:image/png;base64,AAAA'
    const { container } = render(<PersonAvatar person={{ ...AMA, image }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', image)
    expect(container).not.toHaveTextContent('AM')
  })

  it('falls back to the initials when the photo can’t load', () => {
    const { container } = render(
      <PersonAvatar person={{ ...AMA, image: 'data:image/png;base64,' }} />,
    )
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('AM')
  })
})
