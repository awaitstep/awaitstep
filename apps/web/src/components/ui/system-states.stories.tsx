import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoadError } from './load-error'
import { NotFoundView } from './not-found-view'
import { FilterSkeleton, ListCardSkeleton, LoadingRegion } from './skeletons'

// LoadingState, LoadError and NotFound, one component each. The Workflows
// list composite shows the first two in their page frame.
const meta = {
  title: 'UI/System states',
  decorators: [
    (Story) => (
      <div className="max-w-[1200px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
  render: () => (
    <LoadingRegion label="Loading workflows">
      <FilterSkeleton />
      <ListCardSkeleton />
    </LoadingRegion>
  ),
}

export const LoadingOneRow: Story = {
  render: () => (
    <LoadingRegion label="Loading functions">
      <ListCardSkeleton rows={1} trailing={1} />
    </LoadingRegion>
  ),
}

function RetryDemo({ startAttempts = 0 }: { startAttempts?: number }) {
  const [attempts, setAttempts] = useState(startAttempts)
  function handleRetry() {
    setAttempts((current) => current + 1)
  }
  return (
    <LoadError
      title="We couldn't load workflows"
      detail={
        attempts === 0
          ? 'The server took too long to answer. Nothing was changed. Try again in a moment.'
          : `Still not answering after ${attempts + 1} tries. Check the status page, or try again in a minute.`
      }
      onRetry={handleRetry}
      attempts={attempts}
      statusHref="https://status.awaitstep.dev"
      errorId="req_7f2a91c4"
    />
  )
}

export const LoadErrorFirstTry: Story = { render: () => <RetryDemo /> }

export const LoadErrorAfterTwoTries: Story = { render: () => <RetryDemo startAttempts={2} /> }

export const LoadErrorRetrying: Story = {
  render: () => (
    <LoadError
      title="We couldn't load workflows"
      detail="The server took too long to answer. Nothing was changed."
      onRetry={() => undefined}
      retrying
      errorId="req_7f2a91c4"
    />
  ),
}

export const LoadErrorMinimal: Story = {
  render: () => (
    <LoadError
      title="We couldn't load runs"
      detail="Something went wrong on our side. Nothing was changed."
      onRetry={() => undefined}
    />
  ),
}

export const NotFoundWorkspace: Story = {
  render: () => (
    <NotFoundView
      kind="workspace"
      name="finance"
      parentName="Project 101"
      path="/acme/project-101/finance"
      primary={{ label: 'Open Project 101', href: '#' }}
      secondary={{ label: 'Back to projects', href: '#' }}
    />
  ),
}

export const NotFoundProject: Story = {
  render: () => (
    <NotFoundView
      kind="project"
      name="billing"
      parentName="Acme Inc"
      path="/acme/billing"
      primary={{ label: 'Back to projects', href: '#' }}
    />
  ),
}

export const NotFoundPage: Story = {
  render: () => (
    <NotFoundView
      kind="page"
      name="reports"
      parentName="Sales"
      path="/acme/project-101/sales/reports"
      primary={{ label: 'Open Sales', href: '#' }}
      secondary={{ label: 'Back to projects', href: '#' }}
    />
  ),
}
