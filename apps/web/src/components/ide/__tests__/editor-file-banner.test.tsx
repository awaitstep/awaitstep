import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditorFileBanner } from '../editor-file-banner'

function renderBanner(overrides: Partial<React.ComponentProps<typeof EditorFileBanner>> = {}) {
  const props: React.ComponentProps<typeof EditorFileBanner> = {
    path: 'lib/a.ts',
    editability: { readOnly: false, message: null },
    isVirtual: false,
    historical: false,
    onOpenLatest: vi.fn(),
    onSaveAsFile: vi.fn(),
    onConvertHandlers: vi.fn(),
    ...overrides,
  }
  const view = render(<EditorFileBanner {...props} />)
  return { props, view }
}

describe('EditorFileBanner', () => {
  it('says nothing for an editable stored file', () => {
    const { view } = renderBanner()
    expect(view.container).toBeEmptyDOMElement()
  })

  it('explains an older version and links to the latest', async () => {
    const { props } = renderBanner({
      editability: {
        readOnly: true,
        message: 'Older versions are read-only. Open the latest to edit.',
      },
      historical: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Older versions are read-only')
    await userEvent.click(screen.getByRole('button', { name: 'Open latest' }))
    expect(props.onOpenLatest).toHaveBeenCalled()
  })

  it('explains a generated file without offering a way out', () => {
    renderBanner({ editability: { readOnly: true, message: 'Generated from the canvas.' } })
    expect(screen.getByRole('status')).toHaveTextContent('Generated from the canvas')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Save as file and Convert for the settings-derived handlers.ts', async () => {
    const { props } = renderBanner({ path: 'handlers.ts', isVirtual: true })
    await userEvent.click(screen.getByRole('button', { name: 'Save as file' }))
    await userEvent.click(screen.getByRole('button', { name: /Convert to handler modules/ }))
    expect(props.onSaveAsFile).toHaveBeenCalledWith('handlers.ts')
    expect(props.onConvertHandlers).toHaveBeenCalled()
  })

  it('offers only Save as file for a settings-derived package.json', () => {
    renderBanner({ path: 'package.json', isVirtual: true })
    expect(screen.getByRole('status')).toHaveTextContent('dependency settings')
    expect(screen.queryByRole('button', { name: /Convert/ })).toBeNull()
  })
})

describe('older version precedence', () => {
  it('names the version, not the file, when a generated file is open in an older version', () => {
    renderBanner({
      editability: { readOnly: true, message: 'Generated from the canvas.' },
      historical: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Older versions are read-only')
    expect(screen.getByRole('button', { name: 'Open latest' })).toBeInTheDocument()
  })
})
