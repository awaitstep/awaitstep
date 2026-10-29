import { Heading, Link, Section, Text } from 'react-email'
import Layout from '../layout.js'

interface InvitationEmailProps {
  url: string
  orgName: string
  inviterName: string
  /** "Editor in Sales (Project 101)", or "a member" for an org-wide role. */
  placeLine: string
  expiresLine: string
  appName?: string
  appUrl?: string
}

export function InvitationEmail({
  url,
  orgName,
  inviterName,
  placeLine,
  expiresLine,
  appName = 'AwaitStep',
  appUrl,
}: InvitationEmailProps) {
  return (
    <Layout preview={`${inviterName} invited you to ${orgName}`} appUrl={appUrl}>
      <Heading as="h2" className="text-gray-900 text-xl font-semibold mt-0 mb-2">
        {inviterName} invited you to {orgName}
      </Heading>
      <Text className="leading-normal text-base mb-2 mt-0">
        You will join as {placeLine}. Open the invite to accept it in {appName}; signing in creates
        your account if you do not have one.
      </Text>
      <Text className="leading-normal text-sm text-gray-500 mb-6 mt-0">{expiresLine}</Text>
      <Section className="text-center mb-6">
        <Link
          className="bg-brand text-white text-sm font-medium px-8 py-3 rounded-lg no-underline inline-block"
          href={url}
        >
          Open the invite
        </Link>
      </Section>
      <Text className="text-xs text-gray-500 mt-0 mb-0">
        If you weren&apos;t expecting this, you can ignore this email; nothing happens until you
        accept.
      </Text>
    </Layout>
  )
}

export default InvitationEmail
