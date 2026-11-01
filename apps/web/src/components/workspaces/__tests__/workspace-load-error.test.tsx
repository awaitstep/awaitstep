import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import { WorkspaceLoadError } from '../workspace-load-error'

function show(error: unknown) {
  render(<WorkspaceLoadError what="API keys" error={error} onRetry={() => {}} retrying={false} />)
}

describe('WorkspaceLoadError', () => {
  it('says why a refusal happened, in the server’s words', () => {
    show(new ApiError('Only org owners and admins can do this', 403))
    expect(screen.getByText('Only org owners and admins can do this')).toBeInTheDocument()
    expect(screen.queryByText(/took too long/)).toBeNull()
  })

  it('calls a server failure or a lost connection the server not answering', () => {
    show(new ApiError('Internal server error', 500))
    expect(screen.getByText(/The server took too long to answer/)).toBeInTheDocument()
    expect(screen.queryByText('Internal server error')).toBeNull()
  })
})
