import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Banner } from './banner'
import { RequestAction } from './request-action'
import { RolePill, type Role } from './role-pill'
import { ShellLink } from './shell-link'

// What a Viewer sees (ViewerWorkflows) and the one-time asks shared with
// InviteExpired, plus the banner LoadError reuses.
const meta = {
  title: 'UI/Viewer and banners',
  decorators: [
    (Story) => (
      <div className="max-w-[760px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const ROLES: Role[] = ['owner', 'admin', 'member', 'editor', 'viewer']

export const RolePills: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((role) => (
        <RolePill key={role} role={role} />
      ))}
    </div>
  ),
}

export const Banners: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Banner tone="info">
        Read-only in Sales. Buttons you can&apos;t use are hidden or greyed out, never broken.
      </Banner>
      <Banner tone="warn">
        Your deployed workflows keep running. Only this page couldn&apos;t load.
      </Banner>
      <Banner
        tone="warn"
        action={
          <ShellLink href="#" className="font-medium underline underline-offset-4">
            Status page
          </ShellLink>
        }
      >
        Some runs are delayed while Cloudflare recovers.
      </Banner>
    </div>
  ),
}

function AskForEditAccess({ initiallyRequested = false }: { initiallyRequested?: boolean }) {
  const [requested, setRequested] = useState(initiallyRequested)
  function handleRequest() {
    setRequested(true)
  }
  return (
    <div className="flex items-center gap-3">
      <RolePill role="viewer" />
      <RequestAction
        label="Ask for edit access"
        sentLabel="Asked Ama Mensah"
        requested={requested}
        onRequest={handleRequest}
      />
    </div>
  )
}

export const AskEditAccess: Story = {
  render: () => <AskForEditAccess />,
}

export const AskEditAccessSent: Story = {
  render: () => <AskForEditAccess initiallyRequested />,
}

function AskForInvite() {
  const [requested, setRequested] = useState(false)
  function handleRequest() {
    setRequested(true)
  }
  return (
    <RequestAction
      label="Ask Ama for a new invite"
      sentLabel="Sent. Ama gets an email and an inbox notification."
      requested={requested}
      onRequest={handleRequest}
      variant="default"
      size="lg"
    />
  )
}

export const AskNewInvite: Story = {
  render: () => <AskForInvite />,
}
