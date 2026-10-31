import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, Raw, Status } from '../components.js'

interface KeyExpiringEmailProps {
  url: string
  statusLabel: string
  headline: string
  leadLine: string
  rowsHtml: string
  reviewHtml: string
  previewLine: string
  footerNote: string
  appUrl?: string
}

/** T5 — an API key or token is about to stop working. */
export function KeyExpiringEmail({
  url,
  statusLabel,
  headline,
  leadLine,
  rowsHtml,
  reviewHtml,
  previewLine,
  footerNote,
  appUrl,
}: KeyExpiringEmailProps) {
  return (
    <Layout
      preview={previewLine}
      appUrl={appUrl}
      label="Heads up"
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <Status tone="faint">{statusLabel}</Status>
      <Headline>{headline}</Headline>
      <Lead>{leadLine}</Lead>
      <Raw html={rowsHtml} />
      <Actions
        primary={<PrimaryButton href={url}>Create replacement</PrimaryButton>}
        secondaryHtml={reviewHtml}
      />
      <Note>
        We can&apos;t show you the old key again, and a new key is shown only once. Copy it as soon
        as you create it.
      </Note>
    </Layout>
  )
}

export default KeyExpiringEmail
