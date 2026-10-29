import { Heading, Link, Section, Text } from 'react-email'
import Layout from '../layout.js'

interface InviteRequestEmailProps {
  url: string
  orgName: string
  askerEmail: string
  appName?: string
  appUrl?: string
}

/** To an inviter: the person they invited found the invite expired and asked for a new one. */
export function InviteRequestEmail({
  url,
  orgName,
  askerEmail,
  appName = 'AwaitStep',
  appUrl,
}: InviteRequestEmailProps) {
  return (
    <Layout preview={`${askerEmail} asked for a new invite to ${orgName}`} appUrl={appUrl}>
      <Heading as="h2" className="text-gray-900 text-xl font-semibold mt-0 mb-2">
        {askerEmail} asked for a new invite
      </Heading>
      <Text className="leading-normal text-base mb-6 mt-0">
        The invite you sent to {askerEmail} for {orgName} expired before they could accept it.
        Resend it from Members in {appName} and they get a fresh link.
      </Text>
      <Section className="text-center mb-6">
        <Link
          className="bg-brand text-white text-sm font-medium px-8 py-3 rounded-lg no-underline inline-block"
          href={url}
        >
          Open Members
        </Link>
      </Section>
      <Text className="text-xs text-gray-500 mt-0 mb-0">
        You get this once per invite. If you&apos;d rather not invite them again, there is nothing
        to do.
      </Text>
    </Layout>
  )
}

export default InviteRequestEmail
