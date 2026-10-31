import Layout, { Footer } from '../layout.js'
import {
  Actions,
  Headline,
  Kicker,
  Lead,
  Note,
  PrimaryButton,
  Raw,
  TextLink,
} from '../components.js'

interface AccessRequestEmailProps {
  approveUrl: string
  declineUrl: string
  headline: string
  leadLine: string
  rowsHtml: string
  /** "Want to give a different role? …", markup built by the renderer; empty when there is no edit link. */
  noteHtml: string
  previewLine: string
  footerNote: string
  appUrl?: string
}

/** T3 — someone asked a workspace manager for access. */
export function AccessRequestEmail({
  approveUrl,
  declineUrl,
  headline,
  leadLine,
  rowsHtml,
  noteHtml,
  previewLine,
  footerNote,
  appUrl,
}: AccessRequestEmailProps) {
  return (
    <Layout
      preview={previewLine}
      appUrl={appUrl}
      label="Needs your decision"
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <Kicker>Access request</Kicker>
      <Headline>{headline}</Headline>
      <Lead>{leadLine}</Lead>
      <Raw html={rowsHtml} />
      <Actions
        primary={<PrimaryButton href={approveUrl}>Approve</PrimaryButton>}
        secondary={<TextLink href={declineUrl}>Decline</TextLink>}
      />
      <Note html={noteHtml} />
    </Layout>
  )
}

export default AccessRequestEmail
