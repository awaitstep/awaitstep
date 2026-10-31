import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarX, Mail, Pencil, Plus } from 'lucide-react'
import { GitHubIcon, GoogleIcon } from '../icons/provider-icons'
import { AuthCard, FactList } from '../ui/auth-card'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ListCard, ListRow } from '../ui/list-card'
import { RequestAction } from '../ui/request-action'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { WORKSPACE_TILE_CLASS } from '../ui/workspace-colour'
import { AuthLayout } from './auth-layout'
import { AUTH_FOOTER_LINKS, CHOOSE_ORGS } from './__tests__/fixtures/auth'

// SignIn, AcceptInvite, InviteWrongAccount, InviteExpired and ChooseOrg. Each
// board is one AuthCard, so these are the per-component stories, not
// composites. P9 wires sign-in to the real auth calls.
const meta = {
  title: 'Shell/Auth screens',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <AuthLayout footerLinks={AUTH_FOOTER_LINKS}>
        <Story />
      </AuthLayout>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function OrgTile({ initial }: { initial: string }) {
  return (
    <Tile tone="ok" size="lg">
      {initial}
    </Tile>
  )
}

function SignInDemo({ initiallySent = false }: { initiallySent?: boolean }) {
  const [sent, setSent] = useState(initiallySent)
  const [email, setEmail] = useState('daniel@acme.test')
  function handleSend() {
    setSent(true)
  }
  function handleBack() {
    setSent(false)
  }
  if (sent) {
    return (
      <AuthCard
        width="sm"
        title="Check your email"
        lead={`We sent a sign-in link to ${email}.`}
        actions={
          <Button variant="outline" size="lg" onClick={handleBack}>
            Use a different email
          </Button>
        }
      >
        <div className="flex items-center gap-3.5 rounded-xl border border-status-success/20 bg-tone-ok/40 p-4 text-xs leading-relaxed">
          <Tile tone="ok">
            <Mail />
          </Tile>
          The link works once and expires in 10 minutes. Open it on this device.
        </div>
      </AuthCard>
    )
  }
  return (
    <AuthCard
      width="sm"
      title="Sign in to AwaitStep"
      lead="Build durable workflows with your team."
    >
      <div className="flex flex-col gap-2.5">
        <Button variant="outline" size="lg">
          <GitHubIcon />
          Continue with GitHub
        </Button>
        <Button variant="outline" size="lg">
          <GoogleIcon />
          Continue with Google
        </Button>
      </div>
      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <FormField label="Work email">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
        />
      </FormField>
      <Button size="lg" onClick={handleSend}>
        Email me a sign-in link
      </Button>
      <p className="text-2xs leading-relaxed text-center text-muted-foreground">
        New here? Signing in creates your account.
      </p>
    </AuthCard>
  )
}

export const SignIn: Story = { render: () => <SignInDemo /> }

export const SignInSent: Story = { render: () => <SignInDemo initiallySent /> }

function AcceptInviteDemo({ initiallyDeclined = false }: { initiallyDeclined?: boolean }) {
  const [declined, setDeclined] = useState(initiallyDeclined)
  function handleDecline() {
    setDeclined(true)
  }
  function handleUndo() {
    setDeclined(false)
  }
  if (declined) {
    return (
      <AuthCard
        width="md"
        title="Invite declined"
        lead="We let Ama Mensah know. If that was a mistake, ask Ama to invite you again."
        actions={
          <>
            <Button variant="outline" size="lg" onClick={handleUndo}>
              Undo
            </Button>
            <Button asChild variant="ghost" size="lg">
              <ShellLink href="/choose-org">Go to your organizations</ShellLink>
            </Button>
          </>
        }
      />
    )
  }
  return (
    <AuthCard
      width="md"
      avatar={<OrgTile initial="A" />}
      eyebrow="Ama Mensah invited you to"
      title="Join Acme Inc"
      actions={
        <>
          <Button asChild size="lg">
            <ShellLink href="/acme/project-101/sales/workflows">Accept and open Sales</ShellLink>
          </Button>
          <Button variant="outline" size="lg" onClick={handleDecline}>
            Decline
          </Button>
        </>
      }
    >
      <FactList
        items={[
          {
            key: 'workspace',
            leading: <Tile className={WORKSPACE_TILE_CLASS.green}>S</Tile>,
            label: 'Workspace',
            value: 'Sales',
            sub: 'in Project 101',
          },
          {
            key: 'role',
            leading: (
              <Tile tone="info">
                <Pencil />
              </Tile>
            ),
            label: 'Your role',
            value: 'Editor',
            sub: 'Build, run and deploy workflows',
          },
          {
            key: 'account',
            leading: <Avatar name="Daniel Kim" />,
            label: 'Signed in as',
            value: 'daniel@acme.test',
            trailing: (
              <ShellLink href="/sign-in" className="text-xs text-primary hover:underline">
                Not you?
              </ShellLink>
            ),
          },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        You won&apos;t see other projects or workspaces in Acme Inc unless someone adds you. The
        invite expires on 1 Nov.
      </p>
    </AuthCard>
  )
}

export const AcceptInvite: Story = { render: () => <AcceptInviteDemo /> }

export const InviteDeclined: Story = { render: () => <AcceptInviteDemo initiallyDeclined /> }

export const InviteWrongAccount: Story = {
  render: () => (
    <AuthCard
      width="md"
      avatar={<OrgTile initial="A" />}
      eyebrow="Invite to Acme Inc"
      title="This invite is for another email"
      actions={
        <>
          <Button asChild size="lg">
            <ShellLink href="/sign-in">Sign in as sam@acme.test</ShellLink>
          </Button>
          <Button asChild variant="outline" size="lg">
            <ShellLink href="/choose-org">Not now</ShellLink>
          </Button>
        </>
      }
    >
      <FactList
        items={[
          {
            key: 'sent-to',
            leading: (
              <Tile tone="info">
                <Mail />
              </Tile>
            ),
            label: 'Invite sent to',
            value: 'sam@acme.test',
            sub: 'The address that can accept it',
          },
          {
            key: 'account',
            leading: <Avatar name="Sam K" />,
            label: 'Signed in as',
            value: 'sam.k@gmail.com',
            trailing: <Badge variant="warning">Doesn&apos;t match</Badge>,
          },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Sign in as sam@acme.test to accept it. If you can&apos;t use that address, ask Ama Mensah to
        invite this one instead.
      </p>
    </AuthCard>
  ),
}

function InviteExpiredDemo() {
  const [asked, setAsked] = useState(false)
  function handleAsk() {
    setAsked(true)
  }
  return (
    <AuthCard
      width="md"
      avatar={<OrgTile initial="A" />}
      eyebrow="Invite to Acme Inc"
      title="This invite has expired"
      actions={
        <RequestAction
          label="Ask Ama for a new invite"
          sentLabel="Sent. Ama gets an email and an inbox notification."
          requested={asked}
          onRequest={handleAsk}
          variant="default"
          size="lg"
        />
      }
    >
      <FactList
        items={[
          {
            key: 'sender',
            leading: <Avatar name="Ama Mensah" />,
            label: 'Sent by',
            value: 'Ama Mensah',
            sub: 'ama@acme.test',
          },
          {
            key: 'expired',
            leading: (
              <Tile tone="warn">
                <CalendarX />
              </Tile>
            ),
            label: 'Expired',
            value: '18 Oct',
            sub: '7 days after it was sent',
            trailing: <Badge variant="warning">Expired</Badge>,
          },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Invites last 7 days. We can ask Ama to send you a new one.
      </p>
    </AuthCard>
  )
}

export const InviteExpired: Story = { render: () => <InviteExpiredDemo /> }

export const ChooseOrg: Story = {
  render: () => (
    <AuthCard
      width="lg"
      title="Choose an organization"
      lead="Signed in as daniel@acme.test. Next time we'll open the last one you used."
      actions={
        <>
          <Button asChild variant="outline">
            <ShellLink href="/new-org">
              <Plus aria-hidden="true" />
              Create an organization
            </ShellLink>
          </Button>
          <span className="flex-1" />
          <Button asChild variant="ghost">
            <ShellLink href="/sign-in">Sign out</ShellLink>
          </Button>
        </>
      }
    >
      <ListCard label="Your organizations">
        {CHOOSE_ORGS.map((org) => (
          <ListRow
            key={org.slug}
            leading={<OrgTile initial={org.name[0]} />}
            title={org.name}
            href={org.href}
            description={org.meta}
            trailing={org.badge && <Badge variant="neutral">{org.badge}</Badge>}
          />
        ))}
      </ListCard>
    </AuthCard>
  ),
}
