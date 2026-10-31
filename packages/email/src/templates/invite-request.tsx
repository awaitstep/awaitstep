import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton } from '../components.js'

interface InviteRequestEmailProps {
  url: string
  orgName: string
  askerEmail: string
  footerNote: string
  appName?: string
  appUrl?: string
}

/** To an inviter: someone whose invite expired asked for a new one. */
export function InviteRequestEmail({
  url,
  orgName,
  askerEmail,
  footerNote,
  appName = 'AwaitStep',
  appUrl,
}: InviteRequestEmailProps) {
  return (
    <Layout
      preview={`${askerEmail} asked for a new invite to ${orgName}`}
      appUrl={appUrl}
      label="Needs your decision"
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <Headline>{askerEmail} asked for a new invite</Headline>
      <Lead>
        Their invite to {orgName} expired before they could accept it. Send a new one from Members
        in {appName} if you want them to join.
      </Lead>
      <Actions primary={<PrimaryButton href={url}>Open Members</PrimaryButton>} />
      <Note>Nothing happens until you send a new invite.</Note>
    </Layout>
  )
}

export default InviteRequestEmail
