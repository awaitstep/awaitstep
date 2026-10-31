import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { ActionCard } from '../../ui/action-card'
import { ACME, DANIEL, GLOBEX_INVITE, SANDBOX, orgListing } from '../__tests__/fixtures/dashboard'
import { EntryFrame } from './entry-frame'
import { InviteRow } from './invite-row'
import { NoOrgState } from './no-org-state'
import { OrgCard } from './org-card'

// /dashboard's pieces, from the Dashboard (17a) and DashboardEmpty (17b) boards.
const meta = {
  title: 'Orgs/Dashboard',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const ACCOUNT = {
  name: DANIEL.name,
  email: DANIEL.email,
  image: null,
  href: '#account',
}

function noop() {}

function CreateCard() {
  return (
    <ActionCard
      href="#new-org"
      icon={Plus}
      tone="ok"
      title="Create an organization"
      description="For a new company or a side project. You’ll be its owner."
      variant="dashed"
    />
  )
}

function DeclinableInvite() {
  const [declined, setDeclined] = useState(false)

  function handleDecline() {
    setDeclined(true)
  }

  function handleUndo() {
    setDeclined(false)
  }

  return (
    <ul>
      <InviteRow
        invite={GLOBEX_INVITE}
        declined={declined}
        busy={false}
        error={null}
        onDecline={handleDecline}
        onUndo={handleUndo}
      />
    </ul>
  )
}

/** 17a without "Jump back in": the invite, both of Daniel's orgs, Create. */
export const YourOrganizations: Story = {
  render: () => (
    <EntryFrame account={ACCOUNT} onSignOut={noop}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-semibold text-foreground">Welcome back, Daniel</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as daniel@acme.test. Pick an organization, or carry on where you left off.
        </p>
      </div>
      <DeclinableInvite />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li className="grid">
          <OrgCard org={ACME} lastUsed onOpen={noop} />
        </li>
        <li className="grid">
          <OrgCard org={SANDBOX} lastUsed={false} onOpen={noop} />
        </li>
        <li className="grid">
          <CreateCard />
        </li>
      </ul>
    </EntryFrame>
  ),
}

/** 17b: signed in, in no organization yet; the avatar has no account page to open. */
export const NoOrganization: Story = {
  render: () => (
    <EntryFrame account={{ ...ACCOUNT, href: null }} onSignOut={noop}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-semibold text-foreground">Welcome to AwaitStep, Daniel</h1>
        <p className="text-sm text-muted-foreground">Signed in as daniel@acme.test.</p>
      </div>
      <NoOrgState email="daniel@acme.test" />
    </EntryFrame>
  ),
}

export const InviteOpenAndDeclined: Story = {
  render: () => (
    <div className="flex max-w-[74rem] flex-col gap-2.5 p-6">
      <DeclinableInvite />
      <ul>
        <InviteRow
          invite={GLOBEX_INVITE}
          declined
          busy={false}
          error={null}
          onDecline={noop}
          onUndo={noop}
        />
      </ul>
    </div>
  ),
}

/** Each card state: failing + last used, all passing as owner, no runs, many grants, a logo. */
export const OrgCards: Story = {
  render: () => (
    <ul className="grid max-w-[74rem] grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
      <li className="grid">
        <OrgCard org={ACME} lastUsed onOpen={noop} />
      </li>
      <li className="grid">
        <OrgCard org={SANDBOX} lastUsed={false} onOpen={noop} />
      </li>
      <li className="grid">
        <OrgCard
          org={orgListing({
            id: 'new',
            name: 'Bolt Labs',
            initial: 'B',
            projectCount: 0,
            lastOpenedAt: null,
            grants: { projects: [], workspaces: [] },
            health: { failing: 0, lastRunAt: null },
          })}
          lastUsed={false}
          onOpen={noop}
        />
      </li>
      <li className="grid">
        <OrgCard
          org={orgListing({
            id: 'many',
            name: 'Initech',
            initial: 'I',
            projectCount: 3,
            grants: {
              projects: [{ name: 'Billing', role: 'admin' }],
              workspaces: [
                { name: 'Sales', projectName: 'Project 101', role: 'editor' },
                { name: 'IT', projectName: 'Project 101', role: 'viewer' },
              ],
            },
          })}
          lastUsed={false}
          onOpen={noop}
        />
      </li>
      <li className="grid">
        <CreateCard />
      </li>
    </ul>
  ),
}
