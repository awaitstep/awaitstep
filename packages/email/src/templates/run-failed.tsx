import { Heading, Link, Section, Text } from 'react-email'
import Layout from '../layout.js'

interface RunFailedEmailProps {
  url: string
  workflowName: string
  /** "at step “Fetch company”", or empty when no step is known. */
  stepLine: string
  placeName: string
  appName?: string
  appUrl?: string
}

/** To a workflow's creator and its workspace's admins: a run failed. */
export function RunFailedEmail({
  url,
  workflowName,
  stepLine,
  placeName,
  appName = 'AwaitStep',
  appUrl,
}: RunFailedEmailProps) {
  return (
    <Layout preview={`${workflowName} failed`} appUrl={appUrl}>
      <Heading as="h2" className="text-gray-900 text-xl font-semibold mt-0 mb-2">
        {workflowName} failed
      </Heading>
      <Text className="leading-normal text-base mb-6 mt-0">
        A run of {workflowName} in {placeName} failed {stepLine}. Its runs in {appName} show the
        error.
      </Text>
      <Section className="text-center mb-6">
        <Link
          className="bg-brand text-white text-sm font-medium px-8 py-3 rounded-lg no-underline inline-block"
          href={url}
        >
          See runs
        </Link>
      </Section>
      <Text className="text-xs text-gray-500 mt-0 mb-0">
        You get at most one of these an hour per workflow; further failures in the hour are counted
        in your Inbox.
      </Text>
    </Layout>
  )
}

export default RunFailedEmail
