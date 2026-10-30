import { Heading, Link, Section, Text } from 'react-email'
import Layout from '../layout.js'

interface AccessRequestEmailProps {
  url: string
  askerName: string
  workspaceName: string
  projectName: string
  appName?: string
  appUrl?: string
}

/** To a workspace admin: a Viewer asked them for edit access. */
export function AccessRequestEmail({
  url,
  askerName,
  workspaceName,
  projectName,
  appName = 'AwaitStep',
  appUrl,
}: AccessRequestEmailProps) {
  return (
    <Layout preview={`${askerName} asked for edit access to ${workspaceName}`} appUrl={appUrl}>
      <Heading as="h2" className="text-gray-900 text-xl font-semibold mt-0 mb-2">
        {askerName} asked for edit access
      </Heading>
      <Text className="leading-normal text-base mb-6 mt-0">
        {askerName} can view {workspaceName} in {projectName} and asked you to let them edit.
        Approve or decline from your Inbox in {appName}.
      </Text>
      <Section className="text-center mb-6">
        <Link
          className="bg-brand text-white text-sm font-medium px-8 py-3 rounded-lg no-underline inline-block"
          href={url}
        >
          Open your Inbox
        </Link>
      </Section>
      <Text className="text-xs text-gray-500 mt-0 mb-0">
        You get this because you are an admin of {workspaceName}.
      </Text>
    </Layout>
  )
}

export default AccessRequestEmail
