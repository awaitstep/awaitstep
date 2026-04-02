import { Heading, Link, Section, Text } from '@react-email/components'
import Layout from '../layout.js'

interface MagicLinkEmailProps {
  url: string
  appName?: string
}

export function MagicLinkEmail({ url, appName = 'AwaitStep' }: MagicLinkEmailProps) {
  return (
    <Layout preview={`Sign in to ${appName}`}>
      <Heading as="h2" className="text-gray-900 text-xl font-semibold mt-0 mb-2">
        Sign in to {appName}
      </Heading>
      <Text className="leading-normal text-base mb-6 mt-0">
        Click the button below to sign in to your account. This link expires in 5 minutes.
      </Text>
      <Section className="text-center mb-6">
        <Link
          className="bg-brand text-white text-sm font-medium px-8 py-3 rounded-lg no-underline inline-block"
          href={url}
        >
          Sign in to your account
        </Link>
      </Section>
      <Text className="text-xs text-gray-500 mt-0 mb-0">
        If you didn&apos;t request this link, you can safely ignore this email.
      </Text>
    </Layout>
  )
}

export default MagicLinkEmail
